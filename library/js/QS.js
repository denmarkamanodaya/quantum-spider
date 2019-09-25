/**
 * Quantum/Spider CasperJS Framework
 */

var fs = require("fs");
var system = require("system");
var envVars = system.env;
var require = patchRequire(require);

/**
 * Config settings
 * @type {Object}
 */

var config = {
    spiderRoot: envVars.CASPERJS_SPIDER_DIR,
    logsRoot: envVars.LOGS_ROOT,
    dataDir: envVars.SPIDER_DATA,
    vendorRoot: envVars.CASPERJS_VENDOR_DIR,
    sendSpiderDataUrl: envVars.SEND_SPIDER_DATA_URL
};

/**
 * Spider Name
 */
var spiderName;

var spiderVertical;

var filePart;

var casperSingleton;

/**
 * Get a configuration value
 *
 * @param  {String} name
 * @return {String|boolean}
 */
exports.getConfig = function(name) {
    return config[name] || false;
};

/**
 * Get command-line argument by number
 *
 * @param  {Number} num
 * @return {*}
 */
exports.getCliArg = function(num) {
    num += 2;
    if (system.args[num]) {
        return system.args[num];
    }

    return false;
};

/**
 * Get a standard CasperJS instance
 */
exports.getCasper = function() {
    if (casperSingleton) {
        return casperSingleton;
    }

    casperSingleton = require("casper").create(exports.getCasperConfig());
    exports.addStandardErrorHandlers(casperSingleton);
    return casperSingleton;
};

/**
 * Get the spider version number CLI argument
 * @return {String|boolean}
 */
exports.getSpiderVertical = function() {
    if (spiderVertical) {
        return spiderVertical;
    }

    if (exports.getCliArg(2) === false) {
        console.error("Spider vertical not provided.");
        phantom.exit();
    }

    spiderVertical = exports.getCliArg(2);

    return spiderVertical;
};

/**
 * Get spider name
 *
 * When invoking from the command line we expect the spider name to be the
 * second argument.  But since CasperJS has some odd hidden arguments, that
 * works out to be the 5th argument within our code.
 *
 * @returns {String}
 */
exports.getSpiderName = function() {
    if (spiderName) {
        return spiderName;
    }

    if (exports.getCliArg(3) === false) {
        console.error("Spider name not provided as CLI argument.  Exiting...");
        phantom.exit();
    }

    spiderName = exports.getCliArg(3);

    return spiderName;
};

/**
 * Get the spider file hash CLI argument
 * @return {String|boolean}
 */
exports.getSpiderFileHash = function() {
    if (filePart) {
        return filePart;
    }

    if (exports.getCliArg(4) === false) {
        console.error("Spider file hash not provided.");
        phantom.exit();
    }

    filePart = exports.getCliArg(4);

    return filePart;
};

/**
 * Log to file
 * This log is used to track the progress of the spider.  It's NOT used to
 * collect scrape data.
 * @param {{string}} activity
 */
exports.log = function(activity, severity) {
    severity = severity || "INFO";
    var line = "[" + exports.getTimeStamp() + "][" + severity + "]";
    line += activity || "Running spider " + spiderName + "...";
    line += "\n";

    var filename =
        exports.getConfig("logsRoot") +
        "/exe_log/" +
        exports.getSpiderFileHash() +
        ".txt";

    if (!fs.isFile(filename)) {
        fs.write(filename, "", "w");
    }

    fs.write(filename, line, "a");

    // Log errors to standard console also
    if (severity == "ERROR") {
        console.error(activity);
    }
};

/**
 * Scrape data logging methods
 * @type {{Object}}
 */
exports.scrapeDataLog = {
    /**
     * Get the base filename
     * @returns {string}
     */
    getBaseFileName: function() {
        return exports.getSpiderFileHash() + ".txt";
    },
    /**
     * Get absolute scrape data log file name
     * @returns {string}
     * @protected
     */
    _getFilename: function() {
        "use strict";
        return (
            exports.getConfig("dataDir") +
            "/" +
            exports.scrapeDataLog.getBaseFileName()
        );
    },
    /**
     * Write to scrape data log file
     * @param {string} text
     * @param {string} mode
     * @protected
     */
    _write: function(text, mode) {
        fs.write(exports.scrapeDataLog._getFilename(), text, mode);
    },
    /**
     * Reset the spiders scrape data log file
     * Replaces the content of the file with a "--==Begin==--" string to
     * indicate the start of a spider run.
     */
    reset: function() {
        exports.scrapeDataLog._write("--==Begin==--\n", "w");
    },
    /**
     * Save a new scrape data to the log file
     * @param {{Object}} scrapeDataObject
     */
    saveData: function(scrapeDataObject) {
        exports.scrapeDataLog._write(
            JSON.stringify(scrapeDataObject) + "\n",
            "a"
        );
    },
    /**
     * Finalize scrape data log file
     * Adds closing "--==End==--" string to last line to indicate that the file
     * is not being written to any more.
     */
    finalize: function(casper) {
        exports.scrapeDataLog._write("--==End==--", "a");
    },
    /**
     * Send the result of scrape data
     */
    sendResults: function(casper) {
        var url =
            exports.getConfig("sendSpiderDataUrl") +
            exports.scrapeDataLog.getBaseFileName();

        exports.log("Sending scrape data file via " + url);

        casper.thenOpen(url, function() {
            this.exit();
        });

        exports.log("Finished sending file.");
    }
};

/**
 * Get the CasperJS config
 * @returns {{Object}}
 */
exports.getCasperConfig = function() {
    var defaultConfig = {
        clientScripts: exports.getConfig("vendorRoot") + "/jquery/2.0.3.js"
    };

    var configFile =
        exports.getConfig("spiderRoot") +
        "/" +
        exports.getSpiderVertical() +
        "/" +
        exports.getSpiderName() +
        "/config.json";

    var config = {};
    if (fs.isFile(configFile)) {
        var data = fs.read(configFile);
        if (JSON.parse(data)["clientScripts"]) {
            config = JSON.parse(data);
        } else {
            config = defaultConfig;
        }
    } else {
        config = defaultConfig;
    }

    return {
        verbose: true,
        logLevel: "info",
        userAgent:
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/537.22 (KHTML, like Gecko) Chrome/25.0.1364.172 Safari/537.22",
        pageSettings: {
            loadImages: false, // The WebPage instance used by Casper will
            loadPlugins: false // use these settings
        },
        /*
         Important: This injects jQuery into our clients so we can use it to scrape
         data from the DOM.
         */
        clientScripts: [config["clientScripts"]]
    };
};

exports.addStandardErrorHandlers = function(casper) {
    /**
     * Error callback
     */
    casper.on("error", function(msg, backtrace) {
        this.echo("=========================");
        this.echo("ERROR:");
        this.echo(msg);
        this.echo(JSON.stringify(backtrace));
        this.echo("=========================");
    });

    /**
     * Page error callback
     */
    casper.on("page.error", function(msg, backtrace) {
        this.echo("=========================");
        this.echo("PAGE.ERROR:");
        this.echo(msg);
        this.echo(JSON.stringify(backtrace));
        this.echo("=========================");
    });
};

/**
 * Get a timestamp
 * Used mostly for the file logging feature
 * @returns {string}
 */
exports.getTimeStamp = function() {
    // Zero-pad integers like "1" to be "01"
    function pad(num) {
        var s = num + "";
        while (s.length < 2) {
            s = "0" + s;
        }
        return s;
    }

    var myDate = new Date();

    return (
        myDate.getFullYear() +
        "-" +
        pad(myDate.getMonth() + 1) +
        "-" +
        pad(myDate.getDate()) +
        " " +
        pad(myDate.getHours()) +
        ":" +
        pad(myDate.getMinutes()) +
        ":" +
        pad(myDate.getSeconds())
    );
};
