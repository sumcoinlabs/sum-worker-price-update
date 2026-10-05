const FETCH_TIMEOUT_MS = 8000;
const FIAT_REFRESH_MS = 60 * 60 * 1000;
const MIN_UPDATE_GAP_MS = 110 * 1000;
const EXPECTED_INTERVAL_SECONDS = 120;
const PAPRIKA_MIN_GAP_MS = 15 * 60 * 1000;

const CRYPTO = {
  BTC: { gecko: 'bitcoin', paprika: 'btc-bitcoin', coinlore: '90' },
  DGB: { gecko: 'digibyte', paprika: 'dgb-digibyte', coinlore: '43' },
  DOGE: { gecko: 'dogecoin', paprika: 'doge-dogecoin', coinlore: '2' },
  BCH: { gecko: 'bitcoin-cash', paprika: 'bch-bitcoin-cash', coinlore: '2321' },
  LTC: { gecko: 'litecoin', paprika: 'ltc-litecoin', coinlore: '1' },
  PPC: { gecko: 'peercoin', paprika: 'ppc-peercoin', coinlore: '4' }
};

const CRYPTO_SYMBOLS = Object.keys(CRYPTO);

const FIAT_CODES = [
  'ARS','AUD','BDT','BRL','CNY','DKK','EUR','GBP','HRK','IDR','INR','IRR',
  'JPY','KES','KRW','NOK','PHP','PKR','PLN','RON','RUB','SEK','THB','TRY',
  'TZS','UAH','UGX','VND'
];

function ts() {
  return new Date().toISOString();
}

function log(message) {
  console.log(`${ts()} ${message}`);
}

function warn(message) {
  console.warn(`${ts()} ${message}`);
}

function errlog(message, error) {
  console.error(`${ts()} ${message}`, error || '');
}

function cleanNumber(value) {
  const n = Number(value);

  return Number.isFinite(n) && n > 0
    ? Number(n.toPrecision(8))
    : null;
}

function blankCrypto() {
  return Object.fromEntries(
    CRYPTO_SYMBOLS.map(symbol => [
      symbol,
      null
    ])
  );
}

function logCrypto(name, prices) {
  log(
    `🪙 ${name}: ` +
    CRYPTO_SYMBOLS
      .map(
        symbol =>
          `${symbol}=${prices[symbol] ?? 'missing'}`
      )
      .join(' ')
  );
}


/* ============================================================
 * GENERIC FETCH
 * ============================================================
 */

async function fetchJson(
  name,
  url
) {
  const controller =
    new AbortController();

  const started =
    Date.now();

  const timer =
    setTimeout(
      () => controller.abort(),
      FETCH_TIMEOUT_MS
    );

  log(
    `📡 ${name}: ${url}`
  );

  try {
    const response =
      await fetch(
        url,
        {
          signal:
            controller.signal,

          headers: {
            Accept:
              'application/json',

            'User-Agent':
              'SumcoinPriceBot/8.0 (contact@sumcoinindex.com)'
          }
        }
      );

    const text =
      await response.text();

    log(
      `📥 ${name}: HTTP ${response.status} ` +
      `(${Date.now() - started}ms)`
    );

    if (
      !response.ok
    ) {
      const retryAfter =
        response.headers.get(
          'retry-after'
        );

      warn(
        `⚠️ ${name}: HTTP ${response.status}` +
        (
          retryAfter
            ? ` retry-after=${retryAfter}`
            : ''
        )
      );

      return null;
    }

    try {
      const data =
        JSON.parse(text);

      log(
        `✅ ${name}: valid JSON`
      );

      return data;

    } catch {
      warn(
        `⚠️ ${name}: invalid JSON`
      );

      return null;
    }

  } catch (error) {
    warn(
      `⚠️ ${name}: fetch failed - ` +
      `${error?.message || error}`
    );

    return null;

  } finally {
    clearTimeout(timer);
  }
}


/* ============================================================
 * KV
 * ============================================================
 */

async function readPricesWithMetadata(
  env
) {
  try {
    const result =
      await env.sumcoin_kv
        .getWithMetadata(
          'prices',
          {
            type:
              'json'
          }
        );

    log(
      `🗃️ KV READ prices: ` +
      `${result?.value ? 'OK' : 'empty'}`
    );

    return {
      prices:
        result?.value ||
        {},

      metadata:
        result?.metadata ||
        {}
    };

  } catch (error) {
    warn(
      `⚠️ KV READ failed: ` +
      `${error?.message || error}`
    );

    return {
      prices: {},
      metadata: {}
    };
  }
}


/* ============================================================
 * SUM
 * ============================================================
 */

async function getSumPrice() {
  const data =
    await fetchJson(
      'SUM',
      'https://sumcoinindex.com/rates/price2.json'
    );

  const price =
    cleanNumber(
      data?.price
    );

  log(
    `💰 SUM=${price ?? 'missing'}`
  );

  return price;
}


/* ============================================================
 * CRYPTO SOURCE 1
 *
 * COINLORE
 *
 * One request gets ALL six crypto prices.
 * No key.
 * ============================================================
 */

async function cryptoFromCoinLore() {
  const ids =
    CRYPTO_SYMBOLS
      .map(
        symbol =>
          CRYPTO[symbol].coinlore
      )
      .join(',');

  const data =
    await fetchJson(
      'CoinLore',

      `https://api.coinlore.net/api/ticker/?id=${ids}`
    );

  const out =
    blankCrypto();

  if (
    Array.isArray(data)
  ) {
    for (
      const row
      of data
    ) {
      const symbol =
        String(
          row?.symbol ||
          ''
        ).toUpperCase();

      if (
        CRYPTO[
          symbol
        ]
      ) {
        out[
          symbol
        ] =
          cleanNumber(
            row?.price_usd
          );
      }
    }
  }

  logCrypto(
    'CoinLore',
    out
  );

  return out;
}


/* ============================================================
 * CRYPTO SOURCE 2
 *
 * COINGECKO
 *
 * One request gets all six.
 * Used only if CoinLore misses something.
 * ============================================================
 */

async function cryptoFromCoinGecko() {
  const ids =
    Object.values(
      CRYPTO
    )
      .map(
        item =>
          item.gecko
      )
      .join(',');

  const data =
    await fetchJson(
      'CoinGecko',

      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`
    );

  const out =
    blankCrypto();

  if (
    data &&
    typeof data ===
      'object'
  ) {
    for (
      const symbol
      of CRYPTO_SYMBOLS
    ) {
      out[
        symbol
      ] =
        cleanNumber(
          data?.[
            CRYPTO[
              symbol
            ].gecko
          ]?.usd
        );
    }
  }

  logCrypto(
    'CoinGecko',
    out
  );

  return out;
}


/* ============================================================
 * CRYPTO SOURCE 3
 *
 * COINPAPRIKA
 *
 * Emergency fallback only.
 *
 * Only queries coins still missing.
 * Limited to one fallback attempt every 15 minutes.
 * ============================================================
 */

async function cryptoFromCoinPaprika(
  missingSymbols
) {
  const symbols =
    [...missingSymbols];

  const results =
    await Promise.all(
      symbols.map(
        symbol =>
          fetchJson(
            `CoinPaprika ${symbol}`,

            `https://api.coinpaprika.com/v1/tickers/${CRYPTO[symbol].paprika}`
          )
      )
    );

  const out =
    blankCrypto();

  symbols.forEach(
    (
      symbol,
      index
    ) => {
      out[
        symbol
      ] =
        cleanNumber(
          results[
            index
          ]
            ?.quotes
            ?.USD
            ?.price
        );
    }
  );

  logCrypto(
    'CoinPaprika',
    out
  );

  return out;
}


/* ============================================================
 * CRYPTO ROUTER
 *
 * CoinLore
 *    ↓
 * CoinGecko
 *    ↓
 * CoinPaprika emergency fallback
 * ============================================================
 */

async function getCryptoPrices(
  now,
  oldMetadata
) {
  const result =
    blankCrypto();

  const sources = {};

  const mergeMissing =
    (
      candidate,
      sourceName
    ) => {
      for (
        const symbol
        of CRYPTO_SYMBOLS
      ) {
        if (
          result[
            symbol
          ] === null &&

          candidate[
            symbol
          ] !== null
        ) {
          result[
            symbol
          ] =
            candidate[
              symbol
            ];

          sources[
            symbol
          ] =
            sourceName;
        }
      }
    };


  log(
    '🔀 Crypto order: ' +
    'CoinLore -> CoinGecko -> CoinPaprika'
  );


  /*
   * COINLORE
   */

  const coinLore =
    await cryptoFromCoinLore();

  mergeMissing(
    coinLore,
    'CoinLore'
  );


  let missing =
    CRYPTO_SYMBOLS.filter(
      symbol =>
        result[
          symbol
        ] === null
    );


  /*
   * COINGECKO FALLBACK
   */

  if (
    missing.length
  ) {
    log(
      `▶️ CoinGecko fallback; ` +
      `missing=${missing.join(',')}`
    );

    const gecko =
      await cryptoFromCoinGecko();

    mergeMissing(
      gecko,
      'CoinGecko'
    );
  }


  missing =
    CRYPTO_SYMBOLS.filter(
      symbol =>
        result[
          symbol
        ] === null
    );


  /*
   * COINPAPRIKA EMERGENCY FALLBACK
   */

  let paprikaAttempted =
    false;

  let lastPaprikaAttemptAt =
    oldMetadata
      ?.lastPaprikaAttemptAt ||
    null;


  if (
    missing.length
  ) {
    const lastPaprikaMs =
      Date.parse(
        lastPaprikaAttemptAt ||
        ''
      );

    const paprikaAllowed =
      !Number.isFinite(
        lastPaprikaMs
      ) ||

      now -
        lastPaprikaMs >=
        PAPRIKA_MIN_GAP_MS;


    if (
      paprikaAllowed
    ) {
      paprikaAttempted =
        true;

      lastPaprikaAttemptAt =
        new Date(
          now
        ).toISOString();

      log(
        `🆘 CoinPaprika fallback for: ` +
        `${missing.join(',')}`
      );

      const paprika =
        await cryptoFromCoinPaprika(
          missing
        );

      mergeMissing(
        paprika,
        'CoinPaprika'
      );

    } else {
      log(
        `⏭️ CoinPaprika fallback throttled; ` +
        `missing=${missing.join(',')}`
      );
    }
  }


  const stillMissing =
    CRYPTO_SYMBOLS.filter(
      symbol =>
        result[
          symbol
        ] === null
    );


  log(
    `🏁 CRYPTO RESULT: ` +

    CRYPTO_SYMBOLS
      .map(
        symbol =>
          `${symbol}=` +
          `${result[symbol] ?? 'missing'}` +
          `(${sources[symbol] ?? 'none'})`
      )
      .join(' ')
  );


  return {
    prices:
      result,

    sources,

    freshCount:
      CRYPTO_SYMBOLS.length -
      stillMissing.length,

    staleSymbols:
      stillMissing,

    paprikaAttempted,

    lastPaprikaAttemptAt
  };
}


/* ============================================================
 * FIAT SOURCE 1
 *
 * EXCHANGERATE API
 * ============================================================
 */

async function fiatFromExchangeRateApi() {
  const data =
    await fetchJson(
      'ExchangeRate-API',

      'https://open.er-api.com/v6/latest/USD'
    );

  const rates = {};

  if (
    data?.rates &&
    typeof data.rates ===
      'object'
  ) {
    for (
      const code
      of FIAT_CODES
    ) {
      const value =
        cleanNumber(
          data.rates[
            code
          ]
        );

      if (
        value !== null
      ) {
        rates[
          code
        ] =
          value;
      }
    }
  }

  log(
    `💱 ExchangeRate-API supplied ` +
    `${Object.keys(rates).length}/` +
    `${FIAT_CODES.length}`
  );

  return rates;
}


/* ============================================================
 * FIAT SOURCE 2
 *
 * FRANKFURTER
 * ============================================================
 */

async function fiatFromFrankfurter() {
  const data =
    await fetchJson(
      'Frankfurter',

      'https://api.frankfurter.dev/v2/rates?base=usd'
    );

  const rates = {};

  if (
    Array.isArray(
      data
    )
  ) {
    for (
      const row
      of data
    ) {
      const code =
        String(
          row?.quote ||
          ''
        ).toUpperCase();

      const value =
        cleanNumber(
          row?.rate
        );

      if (
        FIAT_CODES.includes(
          code
        ) &&
        value !== null
      ) {
        rates[
          code
        ] =
          value;
      }
    }
  }

  log(
    `💱 Frankfurter supplied ` +
    `${Object.keys(rates).length}/` +
    `${FIAT_CODES.length}`
  );

  return rates;
}


/* ============================================================
 * FIAT ROUTER
 * ============================================================
 */

async function getFiatRates(
  now
) {
  const hour =
    new Date(
      now
    ).getUTCHours();


  const providers =
    hour % 2 === 0

      ? [
          [
            'ExchangeRate-API',
            fiatFromExchangeRateApi
          ],

          [
            'Frankfurter',
            fiatFromFrankfurter
          ]
        ]

      : [
          [
            'Frankfurter',
            fiatFromFrankfurter
          ],

          [
            'ExchangeRate-API',
            fiatFromExchangeRateApi
          ]
        ];


  const rates = {};
  const sources = {};


  log(
    `🔀 Fiat order: ` +
    providers
      .map(
        provider =>
          provider[0]
      )
      .join(' -> ')
  );


  for (
    const [
      name,
      provider
    ]
    of providers
  ) {
    const missing =
      FIAT_CODES.filter(
        code =>
          rates[
            code
          ] ===
          undefined
      );


    if (
      !missing.length
    ) {
      break;
    }


    const candidate =
      await provider();


    for (
      const code
      of missing
    ) {
      const value =
        cleanNumber(
          candidate[
            code
          ]
        );


      if (
        value !== null
      ) {
        rates[
          code
        ] =
          value;

        sources[
          code
        ] =
          name;
      }
    }
  }


  log(
    `🏁 FIAT RESULT ` +
    `${Object.keys(rates).length}/` +
    `${FIAT_CODES.length}`
  );


  return {
    rates,
    sources
  };
}


/* ============================================================
 * FIAT TIMER
 *
 * Fiat updates once per hour.
 * ============================================================
 */

function shouldRefreshFiat(
  now,
  prices,
  metadata
) {
  const missing =
    FIAT_CODES.some(
      code =>
        cleanNumber(
          prices?.[
            code
          ]
        ) === null
    );


  if (
    missing
  ) {
    return true;
  }


  const last =
    Date.parse(
      metadata
        ?.lastFiatRefreshAt ||
      ''
    );


  if (
    !Number.isFinite(
      last
    )
  ) {
    return true;
  }


  return (
    now -
      last >=
    FIAT_REFRESH_MS
  );
}


/* ============================================================
 * WRITE SAFETY TIMER
 *
 * Even if something hits /update too frequently,
 * we will not write again within 110 seconds.
 * ============================================================
 */

function millisecondsSinceLastUpdate(
  metadata,
  now
) {
  const last =
    Date.parse(
      metadata
        ?.completedAt ||
      ''
    );


  return Number.isFinite(
    last
  )
    ? now - last
    : Infinity;
}


/* ============================================================
 * MAIN UPDATE
 *
 * Uptime Kuma:
 *
 * POST /update
 * every 120 seconds
 *
 * Exactly ONE KV write when an update runs.
 * ============================================================
 */

async function updatePrices(
  env,
  trigger =
    'uptime-kuma'
) {
  const startedMs =
    Date.now();

  const startedAt =
    new Date(
      startedMs
    ).toISOString();


  log(
    '============================================================'
  );

  log(
    `🔄 UPDATE REQUEST ` +
    `trigger=${trigger}`
  );


  const existing =
    await readPricesWithMetadata(
      env
    );


  const oldPrices =
    existing.prices ||
    {};


  const oldMetadata =
    existing.metadata ||
    {};


  /*
   * WRITE GUARD
   */

  const sinceLast =
    millisecondsSinceLastUpdate(
      oldMetadata,
      startedMs
    );


  if (
    sinceLast <
    MIN_UPDATE_GAP_MS
  ) {
    const waitMs =
      MIN_UPDATE_GAP_MS -
      sinceLast;


    log(
      `⏭️ UPDATE SKIPPED: ` +
      `last write ${sinceLast}ms ago; ` +
      `wait ${waitMs}ms`
    );


    return {
      ok:
        true,

      skipped:
        true,

      reason:
        'update-too-soon',

      nextEligibleInMs:
        waitMs,

      prices:
        oldPrices,

      status:
        oldMetadata
    };
  }


  /*
   * FIAT REFRESH CHECK
   */

  const refreshFiat =
    shouldRefreshFiat(
      startedMs,
      oldPrices,
      oldMetadata
    );


  log(
    `⚙️ Update plan ` +
    `SUM=yes ` +
    `CRYPTO=yes ` +
    `FIAT=${refreshFiat ? 'yes' : 'no'}`
  );


  /*
   * FETCH EVERYTHING IN PARALLEL
   */

  const [
    sumPrice,
    crypto,
    fiat
  ] =
    await Promise.all([
      getSumPrice(),

      getCryptoPrices(
        startedMs,
        oldMetadata
      ),

      refreshFiat

        ? getFiatRates(
            startedMs
          )

        : Promise.resolve({
            rates: {},
            sources: {}
          })
    ]);


  /*
   * Start with old values.
   *
   * Failed APIs can never erase good data.
   */

  const prices = {
    ...oldPrices
  };


  const coreSources =
    {};


  /* ==========================================================
   * SUM
   * ==========================================================
   */

  if (
    sumPrice !== null
  ) {
    prices.SUM =
      sumPrice;

    coreSources.SUM =
      'Sumcoin Index';

  } else {
    coreSources.SUM =
      'previous KV';

    warn(
      `⚠️ Keeping old SUM=` +
      `${oldPrices.SUM ?? 'missing'}`
    );
  }


  /* ==========================================================
   * CRYPTO
   * ==========================================================
   */

  for (
    const symbol
    of CRYPTO_SYMBOLS
  ) {
    const fresh =
      crypto.prices[
        symbol
      ];


    if (
      fresh !== null
    ) {
      prices[
        symbol
      ] =
        fresh;

      coreSources[
        symbol
      ] =
        crypto.sources[
          symbol
        ];

    } else {
      coreSources[
        symbol
      ] =
        'previous KV';

      warn(
        `⚠️ Keeping old ${symbol}=` +
        `${oldPrices[symbol] ?? 'missing'}`
      );
    }
  }


  /* ==========================================================
   * FIAT
   * ==========================================================
   */

  let lastFiatRefreshAt =
    oldMetadata
      ?.lastFiatRefreshAt ||
    null;


  let fiatSource =
    'not refreshed';


  let fiatFreshCount =
    0;


  if (
    refreshFiat
  ) {
    const used =
      new Set();


    for (
      const code
      of FIAT_CODES
    ) {
      const value =
        cleanNumber(
          fiat.rates[
            code
          ]
        );


      if (
        value !== null
      ) {
        prices[
          code
        ] =
          value;

        fiatFreshCount++;


        if (
          fiat.sources[
            code
          ]
        ) {
          used.add(
            fiat.sources[
              code
            ]
          );
        }
      }
    }


    if (
      fiatFreshCount >
      0
    ) {
      lastFiatRefreshAt =
        new Date()
          .toISOString();


      fiatSource =
        Array.from(
          used
        ).join('+') ||
        'fresh';

    } else {
      fiatSource =
        'failed; previous KV kept';


      warn(
        '⚠️ Fiat refresh failed; preserving old fiat values'
      );
    }


    log(
      `💱 Fiat merged ` +
      `fresh=${fiatFreshCount}`
    );
  }


  /*
   * Never write an empty set.
   */

  if (
    !Object.keys(
      prices
    ).length
  ) {
    throw new Error(
      'No usable prices available; refusing KV write'
    );
  }


  const completedAt =
    new Date()
      .toISOString();


  /* ==========================================================
   * METADATA
   * ==========================================================
   */

  const metadata = {
    version:
      8,

    scheduler:
      'Uptime Kuma',

    expectedIntervalSeconds:
      EXPECTED_INTERVAL_SECONDS,

    startedAt,

    completedAt,

    trigger,

    durationMs:
      Date.now() -
      startedMs,

    lastFiatRefreshAt,

    fiatRefreshed:
      refreshFiat,

    fiatSource,

    fiatFreshCount,

    cryptoFreshCount:
      crypto.freshCount,

    cryptoStaleSymbols:
      crypto.staleSymbols,

    lastPaprikaAttemptAt:
      crypto.lastPaprikaAttemptAt,

    paprikaAttempted:
      crypto.paprikaAttempted,

    sources:
      coreSources
  };


  /* ==========================================================
   * ONE AND ONLY KV WRITE
   * ==========================================================
   */

  log(
    `💾 KV WRITE prices ` +
    `(ONE write) ` +
    `entries=${Object.keys(prices).length}`
  );


  await env.sumcoin_kv.put(
    'prices',

    JSON.stringify(
      prices
    ),

    {
      metadata
    }
  );


  log(
    '✅ KV WRITE complete'
  );


  log(
    `📊 FINAL ` +

    [
      'SUM',
      ...CRYPTO_SYMBOLS
    ]
      .map(
        symbol =>
          `${symbol}=` +
          `${prices[symbol] ?? 'missing'}`
      )
      .join(' ')
  );


  log(
    `📌 SOURCES ` +

    [
      'SUM',
      ...CRYPTO_SYMBOLS
    ]
      .map(
        symbol =>
          `${symbol}=` +
          `${coreSources[symbol] ?? 'none'}`
      )
      .join(' ')
  );


  log(
    `✅ UPDATE COMPLETE ` +
    `trigger=${trigger} ` +
    `in ${Date.now() - startedMs}ms`
  );


  log(
    '============================================================'
  );


  return {
    ok:
      true,

    skipped:
      false,

    prices,

    status:
      metadata
  };
}


/* ============================================================
 * JSON RESPONSE
 * ============================================================
 */

function jsonResponse(
  body,
  status =
    200
) {
  return new Response(
    JSON.stringify(
      body,
      null,
      2
    ),

    {
      status,

      headers: {
        'content-type':
          'application/json; charset=utf-8',

        'access-control-allow-origin':
          '*',

        'cache-control':
          'no-store'
      }
    }
  );
}


/* ============================================================
 * HTTP
 * ============================================================
 */

async function handleRequest(
  request,
  env
) {
  const url =
    new URL(
      request.url
    );


  log(
    `🌐 HTTP ` +
    `${request.method} ` +
    `${url.pathname}`
  );


  /* ==========================================================
   * UPDATE
   *
   * Uptime Kuma POSTs here every 120 seconds.
   * ==========================================================
   */

  if (
    url.pathname ===
    '/update'
  ) {
    if (
      request.method !==
      'POST'
    ) {
      return jsonResponse(
        {
          ok:
            false,

          message:
            'Updates require POST /update.'
        },

        405
      );
    }


    try {
      return jsonResponse(
        await updatePrices(
          env,
          'uptime-kuma'
        )
      );

    } catch (error) {
      errlog(
        '❌ HTTP update failed',

        error?.stack ||
        error
      );


      return jsonResponse(
        {
          ok:
            false,

          error:
            error?.message ||
            String(error)
        },

        500
      );
    }
  }


  /* ==========================================================
   * STATUS
   *
   * Read only.
   * ==========================================================
   */

  if (
    url.pathname ===
      '/' ||

    url.pathname ===
      '/status'
  ) {
    const current =
      await readPricesWithMetadata(
        env
      );


    return jsonResponse(
      {
        ok:
          true,

        worker:
          'Sumcoin price updater',

        workerFormat:
          'ES Modules',

        scheduler:
          'Uptime Kuma POST /update',

        expectedIntervalSeconds:
          EXPECTED_INTERVAL_SECONDS,

        minUpdateGapSeconds:
          MIN_UPDATE_GAP_MS /
          1000,

        kvWritesPerActualUpdate:
          1,

        expectedKvWritesPerDay:
          720,

        prices:
          current.prices,

        status:
          current.metadata
      }
    );
  }


  return jsonResponse(
    {
      ok:
        false,

      error:
        'Not found'
    },

    404
  );
}


/* ============================================================
 * CLOUDFLARE WORKER
 *
 * NO scheduled() handler.
 *
 * Uptime Kuma is now the scheduler.
 * ============================================================
 */

export default {

  async fetch(
    request,
    env,
    ctx
  ) {
    return handleRequest(
      request,
      env
    );
  }

};
