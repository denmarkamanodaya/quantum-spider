<?php

namespace Spider\Database;

class Db
{
    protected function __construct()
    {}

    public static function getSqlConnection()
    {
        return \Spider\Database\Factory::getConnection(
            getenv('SPIDER_SQL_DSN'),
            getenv('SPIDER_SQL_USER'),
            getenv('SPIDER_SQL_PASS')
        );
    }
}
