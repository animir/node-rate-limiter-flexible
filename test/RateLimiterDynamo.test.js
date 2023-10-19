const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { expect } = require('chai');
const { describe, it, beforeEach } = require('mocha');
const RateLimiterDynamo = require('../lib/RateLimiterDynamo');

describe('RateLimiterDynamo with fixed window', function RateLimiterDynamoTest() {
    this.timeout(2000);

    const dynamoClient = new DynamoDBClient({region: 'eu-central-1'});
    
    it('instantiate DynamoDb client', (done) => {
        expect(dynamoClient).to.not.equal(null);
        done();
    });

    it('rate limiter dynamo init', (done) => {
        const rateLimiter = new RateLimiterDynamo({
            storeClient: dynamoClient
        },
        () => {
            done();
        }
        );
        //console.log(rateLimiter);
    });

})
