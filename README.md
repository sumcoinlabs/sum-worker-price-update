# Sumcoin Price Update Worker

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Worker Version](https://img.shields.io/badge/Worker-v8-blue)](#)
[![Scheduler](https://img.shields.io/badge/Scheduler-Uptime%20Kuma-5CDD8B)](https://github.com/louislam/uptime-kuma)
[![Update Interval](https://img.shields.io/badge/Update%20Interval-120%20seconds-blue)](#)
[![KV Writes](https://img.shields.io/badge/KV%20Writes-1%20per%20update-success)](#)
[![License](https://img.shields.io/badge/License-MIT%20%2F%20Apache--2.0-blue)](#)

Cloudflare Worker that maintains current SUM/USD, cryptocurrency/USD, and fiat/USD pricing data for Sumcoin services.

Price data is collected from multiple upstream providers and written to a Cloudflare Workers KV database.

Powered by <a href="https://SumcoinIndex.com">
<img width="100" alt="SumcoinIndex" src="https://user-images.githubusercontent.com/37975862/177676046-33069658-ab6b-4dff-9b53-eee09cc369e0.jpeg">
</a>

## Overview

The worker maintains pricing for:

### Sumcoin

- SUM/USD

### Cryptocurrency

- BTC/USD
- DGB/USD
- DOGE/USD
- BCH/USD
- LTC/USD
- PPC/USD

### Fiat

- ARS
- AUD
- BDT
- BRL
- CNY
- DKK
- EUR
- GBP
- HRK
- IDR
- INR
- IRR
- JPY
- KES
- KRW
- NOK
- PHP
- PKR
- PLN
- RON
- RUB
- SEK
- THB
- TRY
- TZS
- UAH
- UGX
- VND

## Scheduling

Updates are triggered externally by Uptime Kuma.

Uptime Kuma sends:

```text
POST /update


every 120 seconds.
Cloudflare Cron is intentionally not used.
The worker also contains a 110-second minimum update guard. If /update is called again too soon, the request is safely skipped without creating another KV write.
Normal operation:
Uptime Kuma
     |
     | POST /update every 120 seconds
     v
Cloudflare Worker
     |
     | Fetch prices
     v
Cloudflare Workers KV

Price Sources
SUM
SUM/USD is retrieved from SumcoinIndex:
https://sumcoinindex.com/rates/price2.json

Cryptocurrency
Cryptocurrency prices are attempted in the following order:
1. CoinLore - primary source
2. CoinGecko - fallback
3. CoinPaprika - emergency fallback
CoinLore normally retrieves all supported cryptocurrency prices in a single request.
CoinGecko is queried only when CoinLore does not provide one or more required prices.
CoinPaprika is retained as an emergency fallback and is throttled to prevent unnecessary API usage.
If no fresh value can be obtained for a cryptocurrency, the previously valid value stored in KV is preserved.
Fiat Exchange Rates
Fiat exchange rates are refreshed approximately once per hour rather than during every two-minute update cycle.
Sources:
1. ExchangeRate-API
2. Frankfurter
The worker uses the alternate provider as a fallback when necessary.
Previously valid fiat values are preserved if an upstream provider fails.
Cloudflare Workers KV
KV binding:
sumcoin_kv

KV key:
prices

Each successful price update performs exactly one KV write.
At the normal 120-second update interval:
30 updates per hour
720 updates per day
720 KV writes per day

Before performing an update, the worker reads the existing KV value and metadata.
This allows the worker to preserve previously valid pricing whenever an upstream API is unavailable.
Endpoints
GET /
Returns the currently stored prices and update status.
This endpoint is read-only and does not trigger an update.
GET /status
Returns current prices plus worker metadata, including:
- last update time
- update duration
- scheduler
- cryptocurrency freshness
- cryptocurrency source for each asset
- stale symbols
- fiat refresh information
- fiat source
- fallback activity
This endpoint is read-only.
POST /update
Triggers a price update.
This is the endpoint called by Uptime Kuma every 120 seconds.
Example:
curl -X POST https://price-update.totality.workers.dev/update

Reliability
The updater is designed so that an upstream API failure cannot erase valid pricing data.
If a source fails:
- previously valid values remain in KV
- other available sources continue updating
- fallback providers are attempted where appropriate
- missing fresh values retain their previous KV value
- an empty price object is never written
- duplicate update requests inside the 110-second guard are skipped
Update Metadata
Metadata is stored alongside the prices KV value.
Current metadata includes:
version
scheduler
expectedIntervalSeconds
startedAt
completedAt
trigger
durationMs
lastFiatRefreshAt
fiatRefreshed
fiatSource
fiatFreshCount
cryptoFreshCount
cryptoStaleSymbols
lastPaprikaAttemptAt
paprikaAttempted
sources

A healthy update should normally report:
{
  "cryptoFreshCount": 6,
  "cryptoStaleSymbols": [],
  "sources": {
    "SUM": "Sumcoin Index",
    "BTC": "CoinLore",
    "DGB": "CoinLore",
    "DOGE": "CoinLore",
    "BCH": "CoinLore",
    "LTC": "CoinLore",
    "PPC": "CoinLore"
  }
}

Architecture
                      +----------------+
                      |  Uptime Kuma   |
                      +-------+--------+
                              |
                              | POST /update
                              | every 120 sec
                              v
                    +---------+---------+
                    | Cloudflare Worker |
                    |   price-update    |
                    +---------+---------+
                              |
             +----------------+----------------+
             |                |                |
             v                v                v
      SumcoinIndex        CoinLore       ExchangeRate-API
          SUM            CoinGecko          Frankfurter
                        CoinPaprika
             |                |                |
             +----------------+----------------+
                              |
                              v
                    +---------+---------+
                    | Cloudflare KV     |
                    | key: prices       |
                    +---------+---------+
                              |
                              v
                       Sumcoin services

Worker Format
The worker uses the Cloudflare ES Modules format.
There is intentionally:
- no Cloudflare Cron Trigger
- no scheduled() handler
- no automatic update from GET /
- no automatic update from GET /status
Scheduling is handled exclusively by Uptime Kuma.
Configuration
Example KV binding:
name = "price-update"
main = "index.js"
compatibility_date = "2021-12-01"
workers_dev = true

[[kv_namespaces]]
binding = "sumcoin_kv"
id = "861b8c211cb14007a476c0e0c0e3e605"

The KV namespace ID is not an authentication credential.
API tokens, API keys, and other secrets should never be committed to the repository.
License
MIT / Apache 2.0
