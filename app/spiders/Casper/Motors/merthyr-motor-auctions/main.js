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

var userName = "paul@bz9.com";
var password = "Merthyr123";
var getFacetURL = "https://www.auctioneers.co.uk/auction-sale/cars-for-sale.php"

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
    .start("https://www.auctioneers.co.uk/login/")
    .then(function() 
    {
        qs.log("--");
        qs.log("Starting spider run...");

        // Clear previously logged scrape data
        qs.scrapeDataLog.reset();

        /*
            Step 0: Login
        */
        casperThenLoginPage.call(this);

        /*
            Step 1: Loop through each catalogue links and gather all the search results links that we need to scrape
        */
        gatherSearchResultLinksFromCatalogues.call(this);

        /*
            Step 2: After gather all the url from catalogue, navigate and scrape lot info
        */
        this.then(function() {
            qs.log("Navigate lots url and scrape data.");
            if (scrapeData.links.length > 0) {
                spiderDetailsPage.call(this);
            }
        });

        /*
            Step 3: finalize and send result to importer via API call
        */
        this.then(function() {
            qs.log("Spider run completed.");
            qs.scrapeDataLog.finalize(this);
            qs.scrapeDataLog.sendResults(this);
        });
    })
    .run();

/**
 * Initial Login
 *
 * 
 */
function casperThenLoginPage() 
{

    qs.log("Recieved login page. Logging in " + this.getCurrentUrl());

    this.then(function() {
        this.evaluate(
            function(obj) {
                document.querySelector(
                    "#user"
                ).value = obj.userName;
                document.querySelector(
                    "#pass"
                ).value = obj.password;
            },
            { userName: userName, password: password }
        );
    });

    this.then(function() {
        this.waitForSelector(
            "#formLOGIN"
        ).thenClick('input[value="Login"]');
    });

    this.then(function() {
        this.waitForSelector(
            ".account-section-border",
            function() {
                qs.log("Logged in");
            },
            function() {
                qs.log(
                    "Unable to login. Possible issues: credentials mismatch/connection timeout. Please retry"
                );
            }
        ).then(function() {
            getLocations.call(this);
        });
    });
}

/**
 * Open Refine Search Location
 *
 * 
 */
function getLocations() 
{
    qs.log("Getting Locations...");
    this.thenOpen(getFacetURL);
}

/**
 * Gather Catalogues
 *
 * 
 */
function gatherSearchResultLinksFromCatalogues() {
    this.then(function() {
        this.then(function() {
            this.wait(5000);
            // to ensure the page will completely load
            var afterWait = function() {
                // Collect all the links to lots on that page
                this.then(addLinksToScrapeData);
            };

            this.then(function() {
                this.waitForSelector(
                    '[class*="vehicle-block-shadow"]',
                    afterWait
                );
            });
        });
    });
}

/**
 * Add links
 *
 * This function evaluates the current page and looks for links to the data that
 * need to be scraped.  Scrape data links are added to `scrapeData.links`.  Later on, we will
 * loop through that array to gather the scrape data details from each page.
 */
function addLinksToScrapeData() {
    this.then(function() {
        qs.log("Scraping search results page: " + this.getCurrentUrl());

        var newLinks = (newLinks = this.evaluate(getLinks));
        scrapeData.links = scrapeData.links.concat(newLinks);

        qs.log(
            "Found " +
                newLinks.length +
                " links on page. Total to scrape data: " +
                scrapeData.links.length
        );
    });
}

function getLinks() {
    var links = [];

    var elem = document.querySelectorAll('[class="pricingtable-signup"] [href*="/auction-sale/cars/"]');
    var aucd = document.querySelectorAll('div.vehicle-block div.two_third div.one_half:nth-child(2) ul.list li:nth-child(1)');

    // elem.length
    for (var i = 0; i < elem.length; i++) 
    {
        var lotlink = elem[i].href;

        links.push({
            url: lotlink,
            auc: aucd[0].innerText
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

            this.thenOpen(url);

            // to ensure the page will completely load
            var afterWait = function() {
                // Collect all the lot data on that page
                this.then(function() {
                    gatherDetails.call(this, url, lotData);
                    scrapeData.currentData++;
                    this.then(spiderDetailsPage);
                });
            };

            this.then(function() {
                this.waitForSelector('[id="container"]', afterWait);
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
        var lotDetails = this.evaluate(parse, lotData);

        var lotStatus = this.currentHTTPStatus;

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

        if (lotDetails.data.auction_date != "To Be Auctioned Soon") {
            // Save the lotDetails directly to a file (rather than collect it in memory)
            qs.scrapeDataLog.saveData(lotDetails);
        }
    });
}

function parse(lotData) {
    lot = {};

    try {
        function escapeHTML(value) {
            var map = {
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
        }


        var months = ['january','february','march','april','may','june','july','august','september','october','november','december'];

        function monthNameToNum(monthname) 
        {
            var month = months.indexOf(monthname);
            //return month ? month + 1 : 0;
            return month != -1 ? month + 1 : undefined;
        }

        // remove the lot url so that it will not be include in the data object
        delete lotData.url;

        //name
        lot["name"]         = document.querySelector('[id="container"] h1').innerText.trim();
        lot["manufacturer"] = document.querySelector('[id="container"] h1').innerText.trim();
        lot["model"]        = document.querySelector('[id="container"] h1').innerText.trim();

        var details         = {};
        var elem            = document.querySelectorAll('[class*="one_half"] [class*="list none"] li');

        for (var indx = 0; indx < elem.length; indx++) 
        {
            var yearReg = elem[indx].innerText.split("|");

            if (yearReg.length > 1) 
            {
                var yearHeader      = yearReg[0].split(":")[0].trim();
                var yearValue       = yearReg[0].split(":")[1].trim();
                details[yearHeader] = yearValue;

                var regHeader       = yearReg[1].split(":")[0].trim();
                var regValue        = yearReg[1].split(":")[1].trim();
                details[regHeader]  = regValue;
            } 
            else 
            {
                var obj             = elem[indx].innerText.split(":");
                var header          = obj[0].trim();
                var value           = obj[1];
                details[header]     = value;
            }
        }

        if (details["Fuel Type"]) lot["fuel"] = details["Fuel Type"];

        if (details["Transmission"])
            lot["gearbox"] = details["Transmission"];

        // if (details["Auction Date"])
        //     lot["auction_date"] = details["Auction Date"];

        if (details["Reg"]) lot["registration"] = details["Reg"];

        if (details["Colour"]) lot["colour"] = details["Colour"];

        if (details["Mileage"]) lot["mileage"] = details["Mileage"];

        if (details["Mot"]) lot["mot"] = details["Mot"];

        var d = new Date();
        var auction_date_dirty  = lotData.auc.split(":")[1].trim();
        var auction_date_finale; 

        if(auction_date_dirty.indexOf("Today") > 1)
        {
            auction_date_finale = d.getFullYear() + '-' + ("0" +  (d.getMonth()+1)).slice(-2) + '-' + ("0" + (d.getDate())).slice(-2);
        }
        else if(auction_date_dirty.indexOf("Soon") > 1)
        {
            auction_date_finale = "soon";
        }
        else
        {
            var addd = auction_date_dirty.split(" ");
            auction_date_finale = d.getFullYear() + "-" + ("0" +  monthNameToNum(addd[2].toLowerCase())).slice(-2) + "-" + ("0" + addd[1].replace(/\D/g,'')).slice(-2);
        }
        
        lot['auction_date']     = auction_date_finale;

        try {
            var desc = "";
            desc = document.querySelector('[class*="product-data"]').innerText;
            lot["description"] = desc;
        } catch (err) {}

        lot["images"] = [].slice
            .call(document.querySelectorAll('a[class*="mz-thumb"]'))
            .map(function(a) {
                return a.href;
            })
            .filter(function(item, pos, self) {
                return self.indexOf(item) == pos;
            })
            .join(", ");
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
            "google",
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
