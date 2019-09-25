/**
 * Full-Feed Spider
 *
 * This spider type begins to scrape a website from the main search page and
 * then spiders out to each of the different vertical external site details pages to find the
 * relevant data.
 */

var require = patchRequire(require);
var qs = require("../../../../library/js/QS.js");

/**
 * Scrape data navigation object
 *
 * As a spider runs through a site it adds scrape data to this object when they are
 * detected on a search results page. This object is then used to direct the
 * scraping of the scrape data detail from each scrape data page.
 *
 * @type {{links: Array, currentData: number}}
 */
var scrapeData = {
    links: [],
    currentData: 0
};
var search = {
    pages: [],
    currentPage: 0
};

// -----------------------------------------------------------------------------
// Casper initialization
// -----------------------------------------------------------------------------

/**
 * Initialize CasperJS
 */
var casper = qs.getCasper();

/**
 * Initialize any spider event listeners
 */
linkSpiderEventListeners();

casper
    .start("http://www2.amstock.co.uk/arrow/sales.aspx")
    .then(function() {
        qs.log("--");
        qs.log("Starting spider run...");

        // Clear previously logged scrape data
        qs.scrapeDataLog.reset();

        /*
            Step 1: Gather all the search pages
        */
        gatherSearchPages.call(this);

        /*
            Step 2: Loop through each search pages and gather all the lots info
        */
        gatherLotsInfoFromEachPages.call(this);

        /*
            Step 3: After gather all the url from catalogue, navigate and scrape lot info
        */
        this.then(function() {
            if (scrapeData.links.length > 0) {
                spiderDetailsPage.call(this);
            }
        });

        /*
            Step 4: finalize and send result to importer via API call
        */
        this.then(function() {
            qs.log("Spider run completed.");
            qs.scrapeDataLog.finalize(this);
            qs.scrapeDataLog.sendResults(this);
        });
    })
    .run();

function gatherSearchPages() {
    this.then(function() {
        this.click('[value="Search"]');
    });

    this.then(function() {
        qs.log("Gather All Search pages if any.");
        search.pages = this.evaluate(function() {
            var pages = [];
            var totalLots = document
                .querySelector("#Label1")
                .innerHTML.split("<br>")[1]
                .split(" matches")[0]
                .trim();
            var pagesCnt = Math.ceil(totalLots / 10);
            for (var i = 1; i <= pagesCnt; i++) {
                pages.push("a[href*='DataGrid1$ctl14$ctl01']");
            }

            return pages;
        });
    });

    this.then(function() {
        if (search.pages.length > 0) {
            qs.log(search.pages.length + " Total number of pages found");
            qs.log("Navigate search page: " + (search.currentPage + 1));
            search.currentPage++;
        }
    });

    this.then(function() {
        addLotToScrapeData.call(this);
    });
}

function gatherLotsInfoFromEachPages() {
    this.then(function() {
        if (search.pages.length > search.currentPage) {
            qs.log("Navigate search page: " + (search.currentPage + 1));

            // Navigate catalogue url
            this.click("a[href*='DataGrid1$ctl14$ctl01']");

            this.then(function() {
                // To ensure the page will completely load
                var afterWait = function() {
                    // scrape all the lots info on the page
                    addLotToScrapeData.call(this);

                    this.then(function() {
                        // Increment the current search results page
                        search.currentPage++;

                        // Run this function again until there are no more catalogues
                        this.then(gatherLotsInfoFromEachPages);
                    });
                };

                this.then(function() {
                    this.wait(3000);
                    afterWait.call(this);
                });
            });
        }
    });
}

/**
 * Add links
 *
 * This function evaluates the current page and looks for links to the data that
 * need to be scraped.  Scrape data links are added to `scrapeData.links`.  Later on, we will
 * loop through that array to gather the scrape data details from each page.
 */
function addLotToScrapeData() {
    this.then(function() {
        var newLotInfo = [];

        newLotInfo = this.evaluate(getLotInfo, this.getCurrentUrl());
        scrapeData.links = scrapeData.links.concat(newLotInfo);

        qs.log(
            "Found " +
                newLotInfo.length +
                " Total to scrape data: " +
                scrapeData.links.length
        );
    });
}

function getLotInfo(currentURL) {
    var links = [];
    var elem = document.querySelectorAll('table[id="DataGrid1"] tr');

    for (var i = 1; i < elem.length - 1; i++) {
        var url =
            currentURL +
            "?lotnum=" +
            elem[i].querySelectorAll("td")[0].innerText.trim();
        var lot_num = elem[i].querySelectorAll("td")[0].innerText.trim();
        var make = elem[i].querySelectorAll("td")[1].innerText.trim();
        var model = elem[i].querySelectorAll("td")[2].innerText.trim();
        var name =
            elem[i].querySelectorAll("td")[1].innerText.trim() +
            " " +
            elem[i].querySelectorAll("td")[2].innerText.trim();
        var type = elem[i].querySelectorAll("td")[3].innerText.trim();
        var registration = elem[i].querySelectorAll("td")[4].innerText.trim();
        var colour = elem[i].querySelectorAll("td")[5].innerText.trim();
        var fuel = elem[i].querySelectorAll("td")[6].innerText.trim();
        var gearbox = elem[i].querySelectorAll("td")[7].innerText.trim();
        var mot = elem[i].querySelectorAll("td")[8].innerText.trim();
        var mileage = elem[i].querySelectorAll("td")[9].innerText.trim();
        var vat = elem[i].querySelectorAll("td")[10].innerText.trim();
        var auction_date = document
            .querySelector("#Label1")
            .innerHTML.split("<br>")[0]
            .split("Sale Date:")[1]
            .trim();

        links.push({
            url: url,
            lot_num: lot_num,
            make: make,
            model: model,
            name: name,
            type: type,
            registration: registration,
            colour: colour,
            fuel: fuel,
            gearbox: gearbox,
            mot: mot,
            mileage: mileage,
            vat: vat,
            auction_date: auction_date
        });
    }

    return links;
}

/**
 * Spider the details page
 *
 * This function used the array of collected links provided by `scrapeData.links` and
 * provides the logic needed to "loop" over (via recursion) the different lots.
 */
function spiderDetailsPage() {
    var url, lotData;
    this.then(function() {
        if (scrapeData.links[scrapeData.currentData]) {
            url = scrapeData.links[scrapeData.currentData].url;
            lotData = scrapeData.links[scrapeData.currentData] || {};

            this.then(function() {
                gatherDetails.call(this, url, lotData);
                scrapeData.currentData++;
                this.then(spiderDetailsPage);
            });
        } else {
            qs.log(
                "Total lots found: " +
                    scrapeData.links.length +
                    "; Total lots scraped: " +
                    scrapeData.currentData
            );
        }
    });
}

/**
 * Gather the details page
 *
 * This is where the real data harvesting happens.  This method expects to be
 * ran once we've reached a details page.  It then uses the spider's
 * `parse` method to extract all the needed data.  Extracted
 * data is added to the `lotData` array.
 */
function gatherDetails(url, lotData) {
    this.then(function() {
        lotData = lotData || {};
        var finalUrl = url ? url : this.getCurrentUrl();

        // Collect job details
        var lotDetails = parse(lotData);

        var lotStatus = 200;

        if (this.currentHTTPStatus === 404) {
            qs.log(" - Lot: " + finalUrl + " - Error (HTTP 404)", "ERROR");
        } else if (this.currentHTTPStatus === 500) {
            qs.log(" - Lot: " + finalUrl + " - Error (HTTP 505)", "ERROR");
        } else if (lotDetails && lotDetails._error) {
            qs.log(
                " - Lot: " +
                    finalUrl +
                    " - " +
                    JSON.stringify(lotDetails._error),
                "ERROR"
            );
        } else {
            qs.log(" - Lot: " + finalUrl);
        }

        /*
            Apply some additional standard formatting to the raw lot data
         */
        lotDetails = {
            source: {
                url: finalUrl,
                date: new Date().toUTCString(),
                status: lotStatus
            },
            data: lotDetails
        };

        // Save the lotDetails directly to a file (rather than collect it in memory)
        qs.scrapeDataLog.saveData(lotDetails);
    });
}

function parse(lotData) {
    lot = {};

    try {
        lot["images"] = "";
        lot = lotData;
    } catch (err) {
        lot["_error"] = err.message;
    }

    return lot;
}

function linkSpiderEventListeners() {
    casper.on("resource.requested", function(requestData, request) {
        var skip = [
            "facebook",
            "twitter",
            "cdn.syndication",
            "linkedin",
            "google-analytics",
            "youtube",
            "player-en_US",
            "addthis_widget"
        ];

        skip.forEach(function(needle) {
            if (requestData.url.indexOf(needle) > 0) {
                request.abort();
            }
        });
    });
}
