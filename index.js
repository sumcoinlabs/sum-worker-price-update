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
  return event.respondWith(new Response())
})

addEventListener('scheduled', event => {
  event.waitUntil(
    handleSchedule(event.scheduledTime)
  )
})

async function handleSchedule(scheduledDate) {
  //get coinpaprika ppc/usd price 
  const paprikaResponse = await getFromApi("https://api.coinpaprika.com/v1/tickers/ppc-peercoin");
  const ppcUsdPrice = paprikaResponse["quotes"]["USD"]["price"].toFixed(2);
  //write to KV
  await peercoin_kv.put("ppc_usd", ppcUsdPrice);
}