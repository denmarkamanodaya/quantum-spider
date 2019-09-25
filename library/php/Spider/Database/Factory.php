<?php

namespace Spider\Database;

use Spider\Database\Db\Adapter\Pdo;

class Factory
{
    static protected $_connections = array();

    static public function getConnection($pdoDsn, $userName, $password)
    {
        $dnsKey = md5($pdoDsn);
        if (isset(self::$_connections[$dnsKey])) {
            return self::$_connections[$dnsKey];
        }

        $PdoConnection = new \PDO(
            $pdoDsn,
            $userName,
            $password,
            array(
                \PDO::ATTR_ERRMODE            => \PDO::ERRMODE_EXCEPTION,
                \PDO::ATTR_DEFAULT_FETCH_MODE => \PDO::FETCH_ASSOC
            )
        );

        $Db = new Pdo($PdoConnection);

        self::$_connections[$dnsKey] = $Db;

        return self::$_connections[$dnsKey];
    }
}
