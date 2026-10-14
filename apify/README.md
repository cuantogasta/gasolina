# Spain Fuel Prices – Every Gas Station, Official Data ⛽

Get the **official, up-to-date prices of every gas station in Spain** (about 12,000 stations) in seconds: gasoline 95 and 98, diesel, premium diesel, LPG/autogas, CNG, LNG, hydrogen, AdBlue and more. The data comes straight from the Spanish Government's fuel price service (Ministerio para la Transición Ecológica, *Geoportal de Hidrocarburos*), which stations are legally required to keep updated.

No scraping of fragile websites, no proxies, no CAPTCHAs: just clean, structured data you can filter, sort and download as JSON, CSV or Excel.

## What can you do with it?

- 🔎 **Find the cheapest stations** in a province, town or postal code, or around any point (e.g. the 10 cheapest diesel stations within 5 km).
- 🚚 **Fleet and logistics cost control**: plan refuelling stops and check what your drivers pay.
- 📊 **Market and competitor monitoring**: track a brand's prices against the competition, every day.
- 📈 **Historical analysis**: get the official closing prices of any past day.
- 🗺️ **Maps and apps**: every station comes with coordinates, address, brand and opening hours.

## Input

All filters are optional. With no input you get every station in Spain.

| Field | What it does |
|---|---|
| **Provinces** | One or more provinces (e.g. Madrid, Barcelona, Málaga). |
| **Municipality or town** | Text contained in the municipality or town name (accents ignored). |
| **Postal codes** | One or more postal codes or prefixes, e.g. `28001, 28002` or `080`. |
| **Brand** | e.g. `Repsol`, `Ballenoil`, `Plenoil`, `Costco`, or `Unbranded`. |
| **Fuel types** | Only stations selling at least one of these fuels. |
| **Latitude / Longitude / Radius** | Adds the distance to each station and keeps only the ones within the radius. |
| **Sort by** | Cheapest first (by the first selected fuel) or nearest first. |
| **Maximum results** | e.g. `10` with *Cheapest first* gives the 10 cheapest stations. |
| **Historical date** | Official closing prices of a past day (YYYY-MM-DD). |

### Example: the 10 cheapest diesel stations within 5 km of Puerta del Sol (Madrid)

```json
{
  "fuelTypes": ["dieselA"],
  "latitude": "40.4168",
  "longitude": "-3.7038",
  "radiusKm": 5,
  "sortBy": "price",
  "maxResults": 10
}
```

## Output

One record per station. Prices are in **euros per litre** (per kg for hydrogen and gas). Only the fuels the station actually sells are included, and `fuels` lists them.

```json
{
  "stationId": "16519",
  "name": "Plenergy",
  "brand": "Plenergy",
  "address": "Calle Genal, 20",
  "postalCode": "29400",
  "locality": "Ronda",
  "municipality": "Ronda",
  "municipalityId": "4537",
  "province": "Málaga",
  "provinceCode": "29",
  "region": "Andalucía",
  "regionCode": "01",
  "latitude": 36.752667,
  "longitude": -5.15625,
  "openingHours": "L-D: 24H",
  "open24h": true,
  "saleType": "public",
  "fuels": [
    "gasoline95E5",
    "dieselA"
  ],
  "gasoline95E5": 1.629,
  "dieselA": 1.729,
  "pricesDate": "2026-10-14",
  "pricesTime": "18:00",
  "distanceKm": 65.58,
  "source": "Ministerio para la Transición Ecológica (Geoportal de Hidrocarburos)",
  "sourceUrl": "https://geoportalgasolineras.es/"
}
```

Price fields: `gasoline95E5`, `gasoline95E10`, `gasoline95E5Premium`, `gasoline95E25`, `gasoline95E85`, `gasoline98E5`, `gasoline98E10`, `renewableGasoline`, `dieselA`, `dieselPremium`, `dieselB` (agricultural), `renewableDiesel` (HVO), `biodiesel`, `bioethanol`, `lpg`, `cng`, `lng`, `bioCng`, `bioLng`, `hydrogen`, `adblue`, `ammonia`, `methanol`.

Every run also saves a free **SUMMARY** record in the key-value store with the number of stations, the average, minimum and maximum price of each fuel and the cheapest station for each one.

## Pricing

You only pay for the stations you get (pay per result). A whole province usually costs a few cents; all of Spain costs a few dollars. Use the filters and *Maximum results* to get exactly what you need.

## How fresh is the data?

Stations must report every price change, and the official service is refreshed every 30 minutes. Each record includes the date and time of the official update (`pricesDate`, `pricesTime`). Historical runs return the official closing prices of the chosen day.

## FAQ

**Is this legal?** Yes. The data is published by the Spanish Government as open data and may be reused, citing the source. Each record includes the source.

**Can I schedule it?** Yes. Use Apify schedules to run it every day (or every hour) and send the results to Google Sheets, a webhook, your database or any of Apify's integrations.

**Why are some stations missing?** By default only stations open to the public are returned. Turn on *Include restricted-sale stations* to also get stations that only sell to members or fleets.

## Made by

The team behind [CuántoGasta Gasolina](https://cuantogasta.github.io/gasolina/), a free website with the cheapest gas stations in every town in Spain.
