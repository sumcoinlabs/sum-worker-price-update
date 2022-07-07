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
    'https://sumcoinindex.com/rates/price2.json',
  )
  //get currency fiat/usd exchange rates
  const openExchangeResponse = await getFromApi(
    `https://openexchangerates.org/api/latest.json?app_id=${CURRCONV_KEY}`,
  )

  const sumUsdPrice = paprikaResponse['price']
  const rates = openExchangeResponse['rates']

  const prices = {
    ARS: rates['ARS'],
    AUD: rates['AUD'],
    BDT: rates['BDT'],
    BRL: rates['BRL'],
    CNY: rates['CNY'],
    DKK: rates['DKK'],
    EUR: rates['EUR'],
    GBP: rates['GBP'],
    HRK: rates['HRK'],
    IDR: rates['IDR'],
    INR: rates['INR'],
    IRR: rates['IRR'],
    JPY: rates['JPY'],
    KES: rates['KES'],
    KRW: rates['KRW'],
    NOK: rates['NOK'],
    PHP: rates['PHP'],
    PKR: rates['PKR'],
    PLN: rates['PLN'],
    SUM: parseFloat(sumUsdPrice.toFixed(2)),
    RON: rates['RON'],
    RUB: rates['RUB'],
    SEK: rates['SEK'],
    THB: rates['THB'],
    TRY: rates['TRY'],
    TZS: rates['TZS'],
    UAH: rates['UAH'],
    UGX: rates['UGX'],
    VND: rates['VND']
  }

  //write to KV
  await sumcoin_kv.put('prices', JSON.stringify(prices))
}
