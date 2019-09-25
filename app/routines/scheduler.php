<?php
/*
 * This  is responsible for running all the routines
*/

require_once __DIR__ . '/../../vendor/autoload.php';

$dotenv = new Dotenv\Dotenv(__DIR__ . '/../../');
$dotenv->load();

try {
    // Create a new scheduler
    $scheduler = new GO\Scheduler();

    // set paths
    $phpBinPath = getenv('PHP_BIN');
    $routinesLogPath = getenv('SPIDER_ROUTINES');

    // ... configure the scheduled jobs

    // This routine is responsible for queueing of the spider
    $scheduler
        ->php(
            __DIR__ . '/SpiderCronQueue.php',
            $phpBinPath
        )
        ->everyMinute()
        ->onlyOne()
        ->output($routinesLogPath .'/SpiderCronQueue.log', true);

    // This routine is responsible for running the spider in the queue
    $scheduler
        ->php(
            __DIR__ . '/SpiderRunQueue.php',
            $phpBinPath
        )
        ->everyMinute()
        ->onlyOne()
        ->output($routinesLogPath .'/SpiderRunQueue.log', true);

    // Let the scheduler execute jobs which are due.
    $scheduler->run();
} catch (\Exception $e) {
    echo "\r\n Exception Error Message: " . $e->getMessage();
    echo "\r\n Exception Error Trace: " . $e->getTrace();
}
