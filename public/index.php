<?php
/**
 * Quantum/Spiders
 *
 * Responsible for scraping vertical external sites content
 * and transmitting them back to the repository for processing.
 *
 * @copyright 2018 Quantum/Spiders
 */
define('APPLICATION_PATH', __DIR__ . '/../app');

require_once __DIR__ . '/../vendor/autoload.php';

$dotenv = new Dotenv\Dotenv(__DIR__ . '/../');
$dotenv->load();


$settings = include APPLICATION_PATH . '/config/settings.php';

$app = new \Slim\App($settings);

require APPLICATION_PATH . '/config/handlers.php';
require APPLICATION_PATH . '/config/middleware.php';

$app->get('/', function ($request, $response, $args) {
    return "Here be dragons";
});

/**
 * GET /spider/status
 *
 * Looks at the different PID files and examines the running processes to return
 * a status report for all spiders on the server.
 */
$app->get('/spider/status', function ($request, $response, $args) {

    try {
        $status = \Spider\Runtime::getInstance()
            ->getAllProcessesStatus();

        return $response->withStatus(200)
            ->write(
                json_encode(
                    array(
                        "status" => "OK",
                        "result" => $status
                    )
                )
            );
    }
    catch (\Exception $e) {
        return $response->withStatus(500)
            ->write(
                json_encode(
                    array(
                        "status"  => "ERROR",
                        "message" => $e->getMessage(),
                        "trace"   => $e->getTrace()
                    )
                )
            );
    }

});

/**
 * GET /spider/run
 *
 * Run a specific spider.
 */
$app->get('/spider/run', function ($request, $response, $args) {

    try {
        $Runtime = Spider\Runtime::getInstance();
        $Spider = $Runtime->getSpider($request->getQueryParams());

        $success = $Spider->run();

        if ($success) {
            return $response->withStatus(200)
                ->write(
                    json_encode(
                        array(
                            "status" => "OK",
                            "result" => "Spider started."
                        )
                    )
                );
        } else {
            return $response->withStatus(500)
                ->write(
                    json_encode(
                        array(
                            "status"  => "ERROR",
                            "message" => "There was an error running this spider.",
                        )
                    )
                );
        }
    }
    catch (\Exception $e) {
        return $response->withStatus(500)
            ->write(
                json_encode(
                    array(
                        "status"  => "ERROR",
                        "message" => $e->getMessage(),
                        "trace"   => $e->getTrace()
                    )
                )
            );
    }
});

/**
 * Send Spider scrape data file
 */
$app->get('/spider/send', function ($request, $response, $args) {
    $scrapeDataFilename = $request->getQueryParam('file');

    if ($scrapeDataFilename) {
        try {
            $Transmit = new \Spider\Transmit();
            $Transmit->transmitScrapeData($scrapeDataFilename);

            return $response->withStatus(200)
                ->write(
                    json_encode(
                        array(
                            "status" => "OK",
                            "message" => "Scrape data file sent."
                        )
                    )
                );
        }
        catch (\Exception $e) {
            return $response->withStatus(500)
                ->write(
                    json_encode(
                        array(
                            "status"  => "ERROR",
                            "message" => $e->getMessage(),
                            "originalError" => ($e->getPrevious())
                                ? $e->getPrevious()->getMessage()
                                : "",
                            "trace"   => $e->getTrace()
                        )
                    )
                );
        }
    } else {
        return $response->withStatus(500)
            ->write(
                json_encode(
                    array(
                        "status"  => "ERROR",
                        "message" => "Missing scrape data file name (file)"
                    )
                )
            );
    }
});

$app->run();
