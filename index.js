async function gatherResponse(response) {
  const { headers } = response
  const contentType = headers.get("content-type") || ""
  if (contentType.includes("application/json")) {
    return await response.json()
  }
  else {
    return response.text()
  }
}

async function getFromApi(url) {
  const init = {
    headers: {
      "content-type": "application/json",
    },
  }
  const response = await fetch(url, init)
  const results = await gatherResponse(response)
  return results; 
}

addEventListener("fetch", event => {
  event.waitUntil(handleSchedule())
  return event.respondWith(new Response())
})

addEventListener('scheduled', event => {
  event.waitUntil(
    handleSchedule(event.scheduledTime)
  )
})

async function handleSchedule() {
  //get coinpaprika ppc/usd price 
  const paprikaResponse = await getFromApi("https://api.coinpaprika.com/v1/tickers/ppc-peercoin");
  const openExchangeResponse = await getFromApi(`https://openexchangerates.org/api/latest.json?app_id=${CURRCONV_KEY}`);
  const ppcUsdPrice = paprikaResponse["quotes"]["USD"]["price"].toFixed(2);

  //get currency fiat/usd exchange rates
  const rates = openExchangeResponse["rates"];
  const fiatPricesUSD = {
    ARS: rates["ARS"],
    BRL: rates["BRL"],
    CNY: rates["CNY"],
    EUR: rates["EUR"],
    GBP: rates["GBP"],
    HRK: rates["HRK"],
    INR: rates["INR"],
    RON: rates["RON"],
    RUB: rates["RUB"],
  };

  //write to KV
  await peercoin_kv.put("PPC_USD", ppcUsdPrice);
  await peercoin_kv.put("FIAT_USD", JSON.stringify(fiatPricesUSD));
}