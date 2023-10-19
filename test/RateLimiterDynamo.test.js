const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { describe, it, beforeEach } = require('mocha');

describe('RateLimiterDynamo with fixed window', function RateLimiterDynamoTest() {
    this.timeout(2000);

    let dynamoClient = new DynamoDBClient({region: 'eu-central-1'});

})
