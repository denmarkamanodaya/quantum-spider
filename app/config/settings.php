<?php
return [
    'settings' => [
        'displayErrorDetails' => (bool)getenv('DISPLAY_ERRORS'),

        'logger' => [
            'name' => getenv('APP_NAME'),
            'level' => (int)getenv('LOG_LEVEL') ?: 400,
            'path' => getenv('APP_LOGS'),
        ],
    ]
];
