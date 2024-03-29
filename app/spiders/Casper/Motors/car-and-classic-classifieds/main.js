/**
 * Full-Feed Spider 2P
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

var auctionIdx = 0;
var auction_urls = [];

// -----------------------------------------------------------------------------
// Casper initialization
// -----------------------------------------------------------------------------

// Initialize CasperJS
var casper = qs.getCasper();

// Initialize any spider event listeners
linkSpiderEventListeners();


casper.userAgent("Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/37.0.2062.120 Safari/537.36");

casper
    .start("https://www.carandclassic.co.uk/classic_cars.php?category=&make=&region=&country=1&era=&type=1&price=&keyword=&S.x=37&S.y=15")
    .then(function() 
    {
    
        qs.log("--");
        qs.log("Starting spider run...");

        // Step 1: Clear previously logged scrape data
        qs.scrapeDataLog.reset();
        
        // Step 2: Gather all catalogue links
        gatherAllCatalogueLinks.call(this);

        // Step 3: Loop through each catalogue links and gather all the lot links that we need to scrape
        gatherResultLinksFromCatalogues.call(this);

        // Step 4: After gather all the url from catalogue, navigate and scrape lot info
        this.then(function() 
        {
            if (scrapeData.links.length > 0) 
            {
                qs.log("Navigate lots url and scrape data.");

                spiderDetailsPage.call(this);
            }
            else
            {
                qs.log("Navigation completed. No links provided.");
            }
        });

        // Step 4: finalize and send result to importer via API call
        this.then(function() 
        {
            qs.log("Spider run completed.");
            qs.scrapeDataLog.finalize(this);
            qs.scrapeDataLog.sendResults(this);
        });
    })
    .run();

function gatherAllCatalogueLinks() 
{
    this.then(function() 
    {
        qs.log("Gather All Catalogue Links if any.");
        
        this.waitForSelector(
        
            '[id="browserPageItemList"]',
        
            function() 
            {
                auction_urls = this.evaluate(function() 
                {
                    var auction_urls    = [];
			var total_count = document.querySelector("[class='listing-count']").innerText.trim();
			var pagination_length = Math.ceil(total_count.replace(/\D/g,'') / 15);
			
                    for (var x = 1; x <= pagination_length; x++) 
                    {
                        var auction_url     = "https://www.carandclassic.co.uk/classic_cars.php?category=&make=&region=&country=1&era=&type=1&price=&keyword=&S.x=37&S.y=15&page=" + x;

                        auction_urls.push({
                            url: auction_url
                        });
                    }

                    return auction_urls;
                });
            }
        );
    });

    this.then(function() 
    {
        qs.log(auction_urls.length + " Total catatalogues found.");
    });
}

function gatherResultLinksFromCatalogues() 
{
    this.then(function() 
    {
        if (auctionIdx < auction_urls.length && auction_urls[auctionIdx]) 
        {
            qs.log("Navigate catalogue: " + auction_urls[auctionIdx].url);

            // Navigate catalogue url then open to load page
            this.thenOpen(auction_urls[auctionIdx].url);

            this.then(function() 
            {
                var afterWait = function() 
                {
                    addLinksToScrapeData.call(this);

                    this.then(function() 
                    {
                        // Increment the current search results page
                        auctionIdx++;
                    
                        if (scrapeData.links.length > 0) 
                        {
                            // Loop through this function until there is none left
                            this.then(gatherResultLinksFromCatalogues);
                        } 
                        else 
                        {
                            qs.log("No Results Found!");
                        }
                    });
                };

                this.then(function() 
                {
                    this.waitForSelector('#browserPageItemList', afterWait);
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
function addLinksToScrapeData() 
{
    this.then(function() 
    {
        qs.log("Scraping search results page: " + this.getCurrentUrl());

        var newLinks        = this.evaluate(getLinks, auction_urls[auctionIdx]);
        scrapeData.links    = scrapeData.links.concat(newLinks);

        qs.log("Found " + newLinks.length + " links on page. Total to scrape data: " + scrapeData.links.length);
    });
}

// Parse links from element inside the page.
function getLinks(auctionInfo) 
{   
    var links       = [];
    var element     = document.querySelectorAll('#browserPageItemList > div.item');

    for (var i = 0; i < element.length; i++) 
    {
        var lotname         = element[i].querySelector('div.titleAndText > a').innerText.trim();
        var lot_url         = element[i].querySelector('div.titleAndText > a').href;
        var keypoints_obj   = element[i].querySelectorAll('div.itemkeypoints ul');

        if(keypoints_obj.length)
        {
            var price           = keypoints_obj[0].children[0].innerText.trim();
            var estimate        = keypoints_obj[0].children[0].innerText.trim();
            var auction_date    = keypoints_obj[0].children[1].innerText.trim();

            links.push({
                url:            lot_url,
                name:           lotname,
                price:          price,
                auction_date:   auction_date,
                estimate:       estimate
            });
        }
    }

    return links;
}

/**
 * Spider the details page
 *
 * This function used the array of collected links provided by `scrapeData.links` and
 * provides the logic needed to "loop" over (via recursion) the different lots.
 */
function spiderDetailsPage() 
{
    var url, lotData;

    this.then(function() 
    {
        if (scrapeData.links[scrapeData.currentData]) 
        {
            url         = scrapeData.links[scrapeData.currentData].url;
            lotData     = scrapeData.links[scrapeData.currentData] || {};

            qs.log("DK OPEN URL & WAIT: " + url);

            this.thenOpen(url);

            this.waitForSelector('#advertPageItemMain', 

                function()
                {
                    gatherDetails.call(this, url, lotData);
                    scrapeData.currentData++;
                    this.then(spiderDetailsPage);
                },

                function _onTimeout()
                {
                    qs.log("No record of selector on page.", this.getCurrentUrl());
                }
            );
        }
        else 
        {
            qs.log("Total lots found: " + scrapeData.links.length + "; Total lots scraped: " + scrapeData.currentData);
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
function gatherDetails(url, lotData) 
{
    this.then(function() 
    {
        qs.log("DK GATHER DETAILS");

        lotData         = lotData || {};

        var finalUrl    = url;
        var lotDetails  = this.evaluate(parse, lotData);	
        var lotStatus   = this.currentHTTPStatus;

        if(this.currentHTTPStatus === 404) 
        {
            qs.log(" - Lot: " + finalUrl + " - Error (HTTP 404)", "ERROR");
        }
        else if(this.currentHTTPStatus === 500) 
        {
            qs.log(" - Lot: " + finalUrl + " - Error (HTTP 505)", "ERROR");
        }
        else if(lotDetails && lotDetails._error) 
        {
            qs.log(" - Lot: " + finalUrl + " - " + JSON.stringify(lotDetails._error), "ERROR");
        }
        else
        {
            qs.log(" - Lot: " + finalUrl);
        }

        /*
            Apply some additional standard formatting to the raw lot data
         */
        lotDetails = {
            source: {
                url:    finalUrl,
                date:   new Date().toUTCString(),
                status: lotStatus
            },
            data: lotDetails
        };

        // Save the lotDetails directly to a file (rather than collect it in memory)
        qs.scrapeDataLog.saveData(lotDetails);
    });
}

function parse(lotData) 
{
    lot = {};

    try 
    {
        // Escape all HTML characters
        function escapeHTML(value) 
        {
            var map = {
                amp: "&",
                lt: "<",
                gt: ">",
                quot: '"',
                "#039": "'",
                nbsp: " "
            };

            return value.replace(/&([^;]+);/g, function(f, c) { return map[c]; });
        }

        // remove the lot url so that it will not be include in the data object
        delete lotData.url;

        var details = {};

        var vehicle_specs = document.querySelector("#itemText").parentNode.nextElementSibling.children[0];
            vehicle_specs = vehicle_specs.querySelectorAll("tr");

        // for(var i=0; i<vehicle_specs.length; i++)
        // {
        //     if(vehicle_specs[i].children[0].innerText.trim().toLowerCase() == 'exterior')
        //     {   
        //         var sub_obj = vehicle_specs[i].children[1].querySelectorAll('li.specs-list__item');

        //         for(var x=0; x<sub_obj.length; x++)
        //         {
        //             // Colour
        //             if(sub_obj[x].querySelector("span.specs-list__item__name").innerText.trim().toLowerCase() == 'colour')
        //             {
        //                 lot["colour"] = sub_obj[x].querySelector("span.specs-list__item__value").innerText.trim();
        //             }
                    
        //             // Type
        //             if(sub_obj[x].querySelector("span.specs-list__item__name").innerText.trim().toLowerCase() == 'body type')
        //             {
        //                 lot["type"] = sub_obj[x].querySelector("span.specs-list__item__value").innerText.trim();
        //             }
        //         }
        //     }
        // }

        // var feature_specs    = document.querySelectorAll('li.feature-specs__item');

        // lot["engine_size"]  = feature_specs[0].children[0].innerText.trim();
        // lot["fuel"]         = feature_specs[3].children[0].innerText.trim();
        
        // Gearbox
        // if( feature_specs[4].children[0].innerText.trim().toLowerCase() == 'cvt') { lot["gearbox"] = 'Auto' } else { lot["gearbox"] = feature_specs[4].children[0].innerText.trim() } ;
        // lot["mot"]          = "";
        // lot["registration"] = "";



        lot["images"] = [].slice.call(document.querySelectorAll('#advert-gallery li > img'))
            .map(function(img) 
            {
                return img.src;

            }).filter(function(item, pos, self) 
            {
                return self.indexOf(item) == pos;

            }).join(", ");


        // Price
        lot["specs_length"] = vehicle_specs.length;

        for(var i=0; i<vehicle_specs.length; i++)
        {
            if(vehicle_specs[i].querySelector("td.caption").innerText.toLowerCase() == 'make')
            {                   
                // Manufacturer
                lot["type"] = vehicle_specs[i].querySelector("td.caption").nextElementSibling.innerText;
            }

            if(vehicle_specs[i].querySelector("td.caption").innerText.toLowerCase() == 'model')
            {                   
                // Model
                lot["model"] = vehicle_specs[i].querySelector("td.caption").nextElementSibling.innerText;
            }

            if(vehicle_specs[i].querySelector("td.caption").innerText.toLowerCase() == 'mileage')
            {                   
                // Mileage
                lot["mileage"] = vehicle_specs[i].querySelector("td.caption").nextElementSibling.innerText;
            }

            if(vehicle_specs[i].querySelector("td.caption").innerText.toLowerCase() == 'Price')
            {
                // Price
                lot["estimate"] = vehicle_specs[i].querySelector("td.caption").nextElementSibling.innerText;
            }

        }

        // Description
        lot["description"]  = document.querySelector("#itemText").innerText;
        

        lot = jQuery.extend({}, lot, lotData);

    } 
    catch (err) 
    {
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
            "amazonaws",
            "spincar",
            "FMSearchGet",
            "swipetospin",
            "cloudflare",
            "user"
        ];

        skip.forEach(function(needle) {
            if (requestData.url.indexOf(needle) > 0) {
                request.abort();
            }
        });
    });
}
