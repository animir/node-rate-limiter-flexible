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
        
        const testKey = 'delete_test';
        const rateLimiter = new RateLimiterDynamo({
            storeClient: dynamoClient
        },
        () => {
            rateLimiter.set(testKey, 999, 10000)
            .then((data) => {
                rateLimiter.delete(testKey)
                .then((response) => {
                    expect(response).to.equal(true);
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

    it('delete NOT existing item from DynamoDB', (done) => {
        
        const testKey = 'delete_test_2';
        const rateLimiter = new RateLimiterDynamo({
            storeClient: dynamoClient
        },
        () => {
            rateLimiter.set(testKey, 999, 10000)
            .then((data) => {
                rateLimiter.delete(testKey)
                .then((response) => {
                    expect(response).to.equal(true);
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

    it('consume 1 point', (done) => {
        const testKey = 'consume1';

        const rateLimiter = new RateLimiterDynamo({
            storeClient: dynamoClient,
            points: 2,
            duration: 5
        },
        () => {
            rateLimiter.set(testKey, 2, 5000)
            .then((data) => {
                rateLimiter.consume(testKey)
                .then((result) => {
                    console.log(result);
                    expect(result.consumedPoints).to.equal(1);
                    done();
                })
                .catch((err) => {
                    done(err);
                });
            })
            .catch((err) => {
                done(err);
            });

        });
        
    });
    
})
