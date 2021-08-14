async function gatherResponse(response) {
  const { headers } = response
  const contentType = headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return await response.json()
  } else {
    return response.text()
  }
}

async function getFromApi(url) {
  const init = {
    headers: {
      'content-type': 'application/json',
    },
  }
  const response = await fetch(url, init)
  const results = await gatherResponse(response)
  return results
}

addEventListener('fetch', (event) => {
  event.waitUntil(handleSchedule())
  return event.respondWith(new Response())
})

addEventListener('scheduled', (event) => {
  event.waitUntil(handleSchedule())
})

async function handleSchedule() {
  //get coinpaprika ppc/usd price
  const paprikaResponse = await getFromApi(
    'https://api.coinpaprika.com/v1/tickers/ppc-peercoin',
  )
  //get currency fiat/usd exchange rates
  const openExchangeResponse = await getFromApi(
    `https://openexchangerates.org/api/latest.json?app_id=${CURRCONV_KEY}`,
  )

  const ppcUsdPrice = paprikaResponse['quotes']['USD']['price']
  const rates = openExchangeResponse['rates']

  const prices = {
    ARS: rates['ARS'],
    BRL: rates['BRL'],
    CNY: rates['CNY'],
    EUR: rates['EUR'],
    GBP: rates['GBP'],
    HRK: rates['HRK'],
    INR: rates['INR'],
    PPC: parseFloat(ppcUsdPrice.toFixed(6)),
    RON: rates['RON'],
    RUB: rates['RUB'],
  }

  //write to KV
  await peercoin_kv.put('prices', JSON.stringify(prices))
}
