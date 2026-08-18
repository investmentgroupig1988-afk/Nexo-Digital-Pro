import OpenAI from "openai";

type FinnhubQuote = {
  c: number;
  d: number | null;
  dp: number | null;
  h: number;
  l: number;
  o: number;
  pc: number;
  t: number;
  error?: string;
};

type AlphaVantageGoldResponse = {
  nominal?: string;
  timestamp?: string;
  price?: string;
  Note?: string;
  Information?: string;
  "Error Message"?: string;
};

type QuoteRequest = {
  label: string;
  symbol: string;
  currency: string;
};

type MarketQuote = {
  request: QuoteRequest;
  price: number;
  change: number | null;
  changePercent: number | null;
  high: number | null;
  low: number | null;
  previousClose: number | null;
  bid: number | null;
  ask: number | null;
  refreshed: string | null;
};

function getRequiredSecret(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is not set. Add it as a secure environment secret.`);
  }

  return value;
}

async function getBtcQuote(apiKey: string): Promise<MarketQuote> {
  const request: QuoteRequest = {
    label: "BTC",
    symbol: "BINANCE:BTCUSDT",
    currency: "USD",
  };
  const url = new URL("https://finnhub.io/api/v1/quote");
  url.searchParams.set("symbol", request.symbol);
  url.searchParams.set("token", apiKey);

  const response = await fetch(url);
  const payload = (await response.json()) as FinnhubQuote;

  if (!response.ok) {
    throw new Error(
      `${request.label} request failed (${response.status} ${response.statusText})${payload.error ? `: ${payload.error}` : "."}`,
    );
  }

  if (payload.error) {
    throw new Error(`${request.label} request failed: ${payload.error}`);
  }

  if (!Number.isFinite(payload.c) || payload.c <= 0) {
    throw new Error(
      `${request.label} quote is unavailable for symbol ${request.symbol}.`,
    );
  }

  return {
    request,
    price: payload.c,
    change: payload.d,
    changePercent: payload.dp,
    high: payload.h,
    low: payload.l,
    previousClose: payload.pc,
    bid: null,
    ask: null,
    refreshed: payload.t ? new Date(payload.t * 1000).toISOString() : null,
  };
}

async function getGoldQuote(apiKey: string): Promise<MarketQuote> {
  const request: QuoteRequest = {
    label: "GOLD",
    symbol: "XAU/USD",
    currency: "USD / oz",
  };
  const url = new URL("https://www.alphavantage.co/query");
  url.searchParams.set("function", "GOLD_SILVER_SPOT");
  url.searchParams.set("symbol", "GOLD");
  url.searchParams.set("apikey", apiKey);

  const response = await fetch(url);
  const payload = (await response.json()) as AlphaVantageGoldResponse;

  if (!response.ok) {
    throw new Error(
      `${request.label} request failed (${response.status} ${response.statusText}).`,
    );
  }

  const reportedError = payload.Note ?? payload.Information ?? payload["Error Message"];
  if (!payload.price) {
    throw new Error(
      `${request.label} request failed${reportedError ? `: ${reportedError}` : "."}`,
    );
  }

  const price = Number(payload.price);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`${request.label} quote is unavailable for ${request.symbol}.`);
  }

  return {
    request,
    price,
    change: null,
    changePercent: null,
    high: null,
    low: null,
    previousClose: null,
    bid: null,
    ask: null,
    refreshed: payload.timestamp ?? null,
  };
}

function formatNumber(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) {
    return "n/a";
  }

  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function printQuote({
  request,
  price,
  change,
  changePercent,
  high,
  low,
  previousClose,
  bid,
  ask,
  refreshed,
}: MarketQuote): void {
  const direction = change !== null && change > 0 ? "+" : "";

  console.log(`${request.label} (${request.symbol})`);
  console.log(`  Price: ${formatNumber(price)} ${request.currency}`);
  if (change !== null || changePercent !== null) {
    console.log(
      `  Change: ${direction}${formatNumber(change)} (${direction}${formatNumber(changePercent)}%)`,
    );
  }
  if (low !== null || high !== null) {
    console.log(`  Day range: ${formatNumber(low)} - ${formatNumber(high)}`);
  }
  if (previousClose !== null) {
    console.log(`  Previous close: ${formatNumber(previousClose)}`);
  }
  if (bid !== null || ask !== null) {
    console.log(`  Bid / ask: ${formatNumber(bid)} / ${formatNumber(ask)}`);
  }
  if (refreshed) {
    console.log(`  Last refreshed: ${refreshed}`);
  }
}

function printTechnicalData(quotes: MarketQuote[]): void {
  console.log("Datos técnicos disponibles:");

  for (const quote of quotes) {
    console.log(`  ${quote.request.label}:`);
    console.log(`    Precio actual: ${formatNumber(quote.price)} ${quote.request.currency}`);

    if (quote.change !== null || quote.changePercent !== null) {
      console.log(
        `    Cambio: ${formatNumber(quote.change)} (${formatNumber(quote.changePercent)}%)`,
      );
    }
    if (quote.low !== null || quote.high !== null) {
      console.log(
        `    Rango diario: ${formatNumber(quote.low)} - ${formatNumber(quote.high)}`,
      );
    }
    if (quote.previousClose !== null) {
      console.log(`    Cierre anterior: ${formatNumber(quote.previousClose)}`);
    }
    if (quote.refreshed) {
      console.log(`    Actualizado: ${quote.refreshed}`);
    }
  }

  console.log(
    "  Faltan: series históricas, EMA, Fibonacci, volumen, soportes/resistencias y otros indicadores derivados.",
  );
}

async function getOpenAiAnalysis(quotes: MarketQuote[]): Promise<string> {
  const openAiApiKey = getRequiredSecret("OPENAI_API_KEY");
  const openai = new OpenAI({ apiKey: openAiApiKey });

  const marketData = quotes.map((quote) => ({
    asset: quote.request.label,
    symbol: quote.request.symbol,
    price: quote.price,
    currency: quote.request.currency,
    change: quote.change,
    changePercent: quote.changePercent,
    dayLow: quote.low,
    dayHigh: quote.high,
    previousClose: quote.previousClose,
    refreshed: quote.refreshed,
  }));

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    max_completion_tokens: 1200,
    messages: [
      {
        role: "system",
        content: [
          "Eres un analista de mercados prudente y objetivo.",
          "Responde en español.",
          "Analiza únicamente los datos JSON proporcionados.",
          "No inventes valores, indicadores, tendencias, porcentajes de probabilidad ni datos históricos.",
          "No calcules EMA, Fibonacci, volumen, soportes o resistencias porque no están disponibles.",
          "Explica claramente qué se puede observar y qué datos faltan para un análisis técnico completo.",
          "No emitas BUY, SELL ni HOLD: la aplicación decidirá la señal y actualmente no hay datos suficientes para justificarla.",
          "No presentes asesoramiento financiero personalizado.",
        ].join(" "),
      },
      {
        role: "user",
        content: `Analiza estos datos reales recién obtenidos de BTC y XAU/USD:\n${JSON.stringify(marketData, null, 2)}`,
      },
    ],
  });

  const analysis = response.choices[0]?.message?.content?.trim();
  if (!analysis) {
    throw new Error("OpenAI no devolvió un análisis.");
  }

  return analysis;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Error desconocido";
}

async function main(): Promise<void> {
  const finnhubApiKey = getRequiredSecret("FINNHUB_API_KEY");
  const alphaVantageApiKey = getRequiredSecret("ALPHAVANTAGE_API_KEY");
  const results = await Promise.allSettled(
    [getBtcQuote(finnhubApiKey), getGoldQuote(alphaVantageApiKey)],
  );

  console.log(`Market quotes — ${new Date().toLocaleString()}`);
  console.log();

  const failedResult = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failedResult) {
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        printQuote(result.value);
      } else {
        const message =
          result.reason instanceof Error ? result.reason.message : "Unknown error";
        console.error(`${index === 0 ? "BTC" : "GOLD"}: ${message}`);
      }
    });
    throw new Error("No se puede analizar el mercado porque faltan datos.");
  }

  const quotes = results.map(
    (result) => (result as PromiseFulfilledResult<MarketQuote>).value,
  );

  quotes.forEach((quote, index) => {
    printQuote(quote);
    if (index < quotes.length - 1) {
      console.log();
    }
  });
  console.log();
  printTechnicalData(quotes);
  console.log();
  console.log("🚀 Entrando a IA...");
  let analysisAvailable = false;
  try {
    const analysis = await getOpenAiAnalysis(quotes);
    analysisAvailable = true;
    console.log();
    console.log("Análisis de OpenAI:");
    console.log(analysis);
  } catch (error: unknown) {
    console.error();
    console.error(`Análisis de OpenAI: NO DISPONIBLE — ${getErrorMessage(error)}`);
  }

  console.log();
  if (!analysisAvailable) {
    console.log(
      "Señal: NO DISPONIBLE — el análisis de OpenAI no pudo completarse y faltan datos técnicos suficientes.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    "Señal: NO DISPONIBLE — faltan datos históricos e indicadores técnicos suficientes para justificar BUY, SELL o HOLD.",
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`Unable to fetch market quotes: ${message}`);
  process.exitCode = 1;
});