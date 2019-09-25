<?php
/*
 * This routine is responsible for queueing of the spider
*/

require_once __DIR__ . '/../../vendor/autoload.php';

$dotenv = new Dotenv\Dotenv(__DIR__ . '/../../');
$dotenv->load();
try {
    // Get DB connection
    $db = \Spider\Database\Db::getSqlConnection();

    /*
    * get all the spiders to add in queue
    *
    * Criteria:
    *          status = enabled
    *          next_run < date now OR NULL
    *          spider not yet exist in spider_cron_queue table
    *
    * Returns:
    *          spider_profile_id
    *          vertical_name
    *          spider_name
    *          spider_type
    *          cron_schedule
    *
    */
    $sql = "CALL gaukmedi_auctions.usp_spider_get_all_for_queue()";
    $spidersToAddInQueue = $db->fetchAll($sql);

    if (count($spidersToAddInQueue)) {
        echo "\r\nNumber of spider to queued = " . count($spidersToAddInQueue);
        foreach ($spidersToAddInQueue as $spider) {
            $spiderProfileId = $spider['spider_profile_id'];
            $spiderVerticalName = $spider['vertical_name'];
            $spiderName = $spider['spider_name'];
            $spiderType = ucfirst($spider['spider_type']);
            $cron = Cron\CronExpression::factory($spider['cron_schedule']);
            $next_run = $cron->getNextRunDate()->format('Y-m-d H:i:s');

            $sql = "CALL gaukmedi_auctions.usp_spider_add_to_queue(
                :spiderProfileID, :vertical_name,
                :spider_name, :spider_type, :next_run
            )";

            $params = [
                ':spiderProfileID' => $spiderProfileId,
                ':vertical_name' => $spiderVerticalName,
                ':spider_name' => $spiderName,
                ':spider_type' => $spiderType,
                ':next_run' => $next_run,
            ];

            // 1 = success
            $isSuccess = $db->fetchOne($sql, $params);

            if ($isSuccess == 1) {
                echo "\r\nSpider Info Queued: " .
                    'spider_id = ' . $spiderProfileId .
                    ', vertical_name = ' . $spiderVerticalName .
                    ', spider_name = ' . $spiderName .
                    ', spider_type = ' . $spiderType;
            }

        }
    } else {
        echo "\r\nNo spider to be queued.";
    }
} catch (\Exception $e) {
    echo "\r\n Exception Error Message: " . $e->getMessage();
    echo "\r\n Exception Error Trace: " . $e->getTrace();
}

