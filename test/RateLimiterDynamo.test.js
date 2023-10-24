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

    it('get item from DynamoDB', (done) => {
        
        const testKey = 'test';
        const rateLimiter = new RateLimiterDynamo({
            storeClient: dynamoClient
        },
        () => {
            rateLimiter.set(testKey, 999, 10000)
            .then((data) => {
                rateLimiter.get(testKey)
                .then((response) => {
                    expect(response).to.not.equal(null);
                    done();
                })
                .catch((err) => {
                    done(err);
                });
            })
            .catch((err) => {
                done(err);
            })
        }
        );
    });

    it('get NOT existing item from DynamoDB', (done) => {
        
        const testKey = 'not_existing';
        const rateLimiter = new RateLimiterDynamo({
            storeClient: dynamoClient
        },
        () => {
            rateLimiter.get(testKey)
            .then((response) => {
                expect(response).to.equal(null);
                done();
            })
            .catch((err) => {
                done(err);
            });
        }
        );
    });

    it('delete item from DynamoDB', (done) => {
        
        const testKey = 'test';
        const rateLimiter = new RateLimiterDynamo({
            storeClient: dynamoClient
        },
        () => {
            rateLimiter.set(testKey, 999, 10000)
            .then((data) => {
                rateLimiter.delete(testKey)
                .then((response) => {
                    console.log(response)
                    expect(response).to.not.equal(null);
                    done();
                })
                .catch((err) => {
                    done(err);
                });
            })
            .catch((err) => {
                done(err);
            })
        }
        );
    });
    
})
