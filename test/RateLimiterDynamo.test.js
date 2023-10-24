const {DynamoDB} = require('@aws-sdk/client-dynamodb')
const { expect } = require('chai');
const { describe, it, beforeEach } = require('mocha');
const RateLimiterDynamo = require('../lib/RateLimiterDynamo');

describe('RateLimiterDynamo with fixed window', function RateLimiterDynamoTest() {
    this.timeout(5000);

    const dynamoClient = new DynamoDB({region: 'eu-central-1'});
        
    it('instantiate DynamoDb client', (done) => {
        expect(dynamoClient).to.not.equal(null);
        done();
    });

    it('rate limiter dynamo init', (done) => {
        const rateLimiter = new RateLimiterDynamo({
            storeClient: dynamoClient
        },
        (data) => {
            done();
        }
        );
        
    });

    it('get item from DynamoDB', (done) => {
        
        const rateLimiter = new RateLimiterDynamo({
            storeClient: dynamoClient
        },
        () => {
            rateLimiter.get('test')
            .then((response) => {
                done();
            })
            .catch((err) => {
                done(err);
            });
        }
        );
    });
    
})
