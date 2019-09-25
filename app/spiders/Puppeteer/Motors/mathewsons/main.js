const puppeteer = require("puppeteer");

(async () => {
    let scrapeData = {
        links: [],
        currentData: 0
    };

    let auctionIdx = 0;
    let auction_urls = [];

    /**
     * Extract Catalogue Urls
     *
     * Extract all availabe catagologue for the auction site url.
     */
    const extractCatalogueURLs = async url => {
        let page = await browser.newPage();
        await page.goto(url);

        console.log("Gather All Catalogue Links if any.");
        auction_urls = await page.evaluate(() =>
            Array.from(
                document.querySelectorAll('h2[class="auction-title"] a')
            ).map(catalogue => catalogue.href.trim())
        );

        console.log(`Total number of catalogues: ${auction_urls.length}`);

        // close page instance to avoid memory leak and save memory
        await page.close();
    };

    /**
     * Fetch All Links From Catalogues
     *
     * This is a recursive function which navigate all availabe catalogues from
     * The auction site url and fetch all lots links
     */
    const fetchLinksFromCatalogues = async () => {
        if (auctionIdx < auction_urls.length && auction_urls[auctionIdx]) {
            console.log(`Navigate catalogue: ${auction_urls[auctionIdx]}`);

            let page = await browser.newPage();
            await page.goto(auction_urls[auctionIdx]);

            const selector = '[class*="auction-page auction-main"]';
            await page.waitForSelector(selector);

            // Collect all the links to scrape data on the page
            await addLinksToScrapeData(page);

            // Increment the current search results page
            await auctionIdx++;

            // close page instance to avoid memory leak and save memory
            await page.close();

            // Run this function again until there are no more catalogues
            await fetchLinksFromCatalogues();
        }
    };

    /**
     * Add links
     *
     * This function evaluates the current page and looks for links to the data that
     * need to be scraped.  Scrape data links are added to `scrapeData.links`.  Later on, we will
     * loop through that array to gather the scrape data details from each page.
     */
    const addLinksToScrapeData = async page => {
        console.log(
            `Scraping search results page: ${auction_urls[auctionIdx]}`
        );

        let newLinks = [];
        const selector =
            'a[href*="/auctions/auction-dates/vehicles/"][class*="item-thumb"]';

        if ((await page.$(selector)) !== null) {
            newLinks = await page.evaluate(() => {
                let links = [];
                const elem = document.querySelectorAll(
                    'a[href*="/auctions/auction-dates/vehicles/"][class*="item-thumb"]'
                );

                const auctionDate = document
                    .querySelector('h1[class="auction-title"]')
                    .innerText.trim();

                for (let i = 0; i < elem.length; i++) {
                    const lotlink = elem[i].href;
                    let lot_num = "";
                    let estimate = "";

                    if (elem[i].querySelector('[class="lot_number"] strong')) {
                        lot_num = elem[i]
                            .querySelector('[class="lot_number"] strong')
                            .innerText.trim();
                    }

                    if (elem[i].querySelector('[class="price"] strong')) {
                        estimate = elem[i]
                            .querySelector('[class="price"] strong')
                            .innerText.trim();
                    }

                    links.push({
                        url: lotlink,
                        estimate: estimate,
                        auction_date: auctionDate,
                        lot_num: lot_num
                    });
                }

                return links;
            });
        }

        scrapeData.links = scrapeData.links.concat(newLinks);

        console.log(
            `Found ${newLinks.length} links on page. Total to scrape data: ${
                scrapeData.links.length
            }`
        );
    };

    const nativateLotUrls = async () => {
        console.log("Navigate lots url and scrape data.");
        if (scrapeData.links.length > 0) {
            await spiderDetailsPage();
        }
    };

    const finalize = async () => {
        console.log("Spider run completed.");
        //qs.scrapeDataLog.finalize(this);
        //qs.scrapeDataLog.sendResults
    };

    /**
     * Spider the details page
     *
     * This function used the array of collected links provided by `scrapeData.links` and
     * provides the logic needed to "loop" over (via recursion) the different lots.
     */
    const spiderDetailsPage = async () => {
        let url, lotData;

        if (scrapeData.links[scrapeData.currentData]) {
            url = scrapeData.links[scrapeData.currentData].url;
            lotData = scrapeData.links[scrapeData.currentData] || {};

            let page = await browser.newPage();
            let response = await page.goto(url);

            // to ensure the page will completely load
            const selector = '[class*="article-content"]';
            await page.waitForSelector(selector);

            // Collect all the lot data on that page
            await gatherDetails(page, response, url, lotData);

            // Increment the current search results page
            await scrapeData.currentData++;

            // close page instance to avoid memory leak and save memory
            await page.close();

            // Run this function again until there are no more lot links
            await spiderDetailsPage();
        } else {
            console.log(
                `Total lots found: ${scrapeData.links.length}
        ; Total lots scraped: ${scrapeData.currentData}`
            );
        }
    };

    /**
     * Gather the details page
     *
     * This is where the real data harvesting happens.  This method expects to be
     * ran once we've reached a details page.  It then uses the spider's
     * `parse` method to extract all the needed data.  Extracted
     * data is added to the `lotData` array.
     */
    const gatherDetails = async (page, response, url, lotData) => {
        lotData = lotData || {};
        let finalUrl = url ? url : page.url();

        // Collect job details
        let lotDetails = await page.evaluate(parse, lotData);

        let lotHttpStatus = response._status;
        if (lotHttpStatus !== 200) {
            console.log(
                ` - Lot: ${finalUrl} - Error (HTTP ${lotHttpStatus})`,
                "Error"
            );
        } else if (lotDetails && lotDetails._error) {
            console.log(
                ` - Lot: ${finalUrl} - ${JSON.stringify(lotDetails._error)}`,
                "ERROR"
            );
        } else {
            console.log(` - Lot: ${finalUrl}`);
        }

        /*
      Apply some additional standard formatting to the raw lot data
    */
        lotDetails = {
            source: {
                url: finalUrl,
                date: new Date().toUTCString(),
                status: lotHttpStatus
            },
            data: lotDetails
        };

        // Save the lotDetails directly to a file (rather than collect it in memory)
        //qs.scrapeDataLog.saveData(lotDetails);
    };

    const parse = lotData => {
        let lot = {};

        try {
            const escapeHTML = async value => {
                let map = {
                    amp: "&",
                    lt: "<",
                    gt: ">",
                    quot: '"',
                    "#039": "'",
                    nbsp: " "
                };
                return value.replace(/&([^;]+);/g, function(f, c) {
                    return map[c];
                });
            };

            // remove the lot url so that it will not be include in the data object
            delete lotData.url;

            lot["name"] = document
                .querySelector('h1[class*="auction-item-page-title"]')
                .innerText.trim();

            let details = {};
            const elem = document.querySelectorAll(
                '[class="auction-item-page-meta"] ul[class="list-unstyled"] li'
            );

            for (let indx = 0; indx < elem.length; indx++) {
                const header = elem[indx].innerText.split(":")[0].trim();
                const value = elem[indx].innerText
                    .split(":")[1]
                    .trim()
                    .replace(/\s\s/g, "");
                details[header] = escapeHTML(value);
            }

            if (details["Make"]) {
                lot["manufacturer"] = details["Make"];
            }

            if (details["Model"]) {
                lot["model"] = details["Model"];
            }

            if (details["Registration"]) {
                lot["registration"] = details["Registration"];
            }

            if (details["MOT Expiry Date"]) {
                lot["mot"] = details["MOT Expiry Date"];
            }

            lot["description"] = escapeHTML(
                document.querySelector('[class="auction-item-page-desc"]')
                    .innerHTML
            );

            lot["images"] = [].slice
                .call(document.querySelectorAll('[class="carousel-inner"] img'))
                .map(function(img) {
                    return img.src;
                })
                .filter(function(item, pos, self) {
                    return self.indexOf(item) == pos;
                })
                .join(", ");

            lot = jQuery.extend({}, lot, lotData);
        } catch (err) {
            lot["_error"] = err.message;
        }

        return lot;
    };

    // Getting started
    const browser = await puppeteer.launch({ headless: true, dumpio: false });

    // Base auction site url
    const startUrl = "https://mathewsons.co.uk/auctions/auction-dates";
    console.log(`Scraping auction: ${startUrl}`);

    /*
    Step 1: Gather all the catalogue links that we need to scrape
  */
    await extractCatalogueURLs(startUrl);

    /*
    Step 2: Loop through each catalogue links and gather all the search results links that we need to scrape
  */
    await fetchLinksFromCatalogues();

    /*
    Step 3: After gathering all the url from catalogue, navigate and scrape lot info
  */
    await nativateLotUrls();

    /*
      Step 4: finalize and send result to importer via API call
  */
    await finalize();

    // chrome instance exit
    await browser.close();
})();
