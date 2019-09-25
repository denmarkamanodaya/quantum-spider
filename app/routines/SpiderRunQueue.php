<?php
/*
 * This routine is responsible for running the spider in the queue
*/

require_once __DIR__ . '/../../vendor/autoload.php';

$dotenv = new Dotenv\Dotenv(__DIR__ . '/../../');
$dotenv->load();
try {
    // Get DB connection
    $db = \Spider\Database\Db::getSqlConnection();

    /*
    * get one spider in the queue
    *
    * Returns:
    *          spider_profile_id
    *          spider_vertical
    *          spider_name
    *          spider_type
    *
    */
    $sql = "CALL gaukmedi_auctions.usp_spider_get_one_in_queue()";
    $spiderToRun = $db->fetchRow($sql);

    if (is_array($spiderToRun)) {
        $spiderProfileId = $spiderToRun['spider_profile_id'];
        $spiderVertical = $spiderToRun['spider_vertical'];
        $spiderName = $spiderToRun['spider_name'];
        $spiderType = $spiderToRun['spider_type'];

        $spiderUrl = getenv('SPIDER_RUN_URL');

        $curlUrl = $spiderUrl .
            '?type=' . $spiderType .
            '&vertical='. $spiderVertical .
            '&name=' . $spiderName;

        // get curl resource
        $curl = curl_init();

        // set curl options
        curl_setopt_array(
            $curl, array(
                CURLOPT_RETURNTRANSFER => 1,
                CURLOPT_URL => $curlUrl,
                CURLOPT_FAILONERROR => true,
            )
        );

        // Send the request & save response to $resp
        $response = curl_exec($curl);

        $sql = "CALL gaukmedi_auctions.usp_spider_run_success_or_fail(
            :spiderProfileId, :is_success, :error_msg
        )";

        $params = [
            ':spiderProfileId' => $spiderProfileId,
            ':is_success' => true,
            ':error_msg' => ''
        ];

        if (curl_error($curl)) {
            $error_msg = curl_error($curl);
            $params[':is_success'] = false;
            $params[':error_msg'] = $error_msg;

            echo "\r\nSpider Run Error Message: " . $error_msg;
        } else {
            echo "\r\nSpider Run Response: " . $response;
        }

        echo "\r\nSpider Info: " .
            'spider_id = ' . $spiderProfileId .
            ', vertical_name = ' . $spiderVertical .
            ', spider_name = ' . $spiderName .
            ', spider_type = ' . $spiderType;

        $db->fetchOne($sql, $params);
    } else {
        echo "\r\nNo spider to run.";
    }

} catch (\Exception $e) {
    echo "\r\n Exception Error Message: " . $e->getMessage();
    echo "\r\n Exception Error Trace: " . $e->getTrace();
}

