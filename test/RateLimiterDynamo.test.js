const {DynamoDB} = require('@aws-sdk/client-dynamodb')
const { expect } = require('chai');
const { describe, it, beforeEach } = require('mocha');
const RateLimiterDynamo = require('../lib/RateLimiterDynamo');

describe('RateLimiterDynamo with fixed window', function RateLimiterDynamoTest() {
    this.timeout(10000);

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
            duration: 10
        },
        () => {
            rateLimiter.consume(testKey)
                .then((result) => {
                    expect(result.consumedPoints).to.equal(1);
                    rateLimiter.delete(testKey);
                    done();
                })
                .catch((err) => {
                    done(err);
                });

        });
        
    });

    it('rejected when consume more than maximum points', (done) => {
        const testKey = 'consumerej';
    
        const rateLimiter = new RateLimiterDynamo({
            storeClient: dynamoClient,
            points: 1,
            duration: 5
        },
        () => {
            rateLimiter.consume(testKey, 2)
                .then((result) => {
                    expect(result.consumedPoints).to.equal(2);
                    done(Error('must not resolve'));
                })
                .catch((err) => {
                    expect(err.consumedPoints).to.equal(2);
                    done();
                });

        });
    });

    it('blocks key for block duration when consumed more than points', (done) => {
        const testKey = 'block';
        
        const rateLimiter = new RateLimiterDynamo({
            storeClient: dynamoClient,
            points: 1,
            duration: 1,
            blockDuration: 2
        },
        () => {
            rateLimiter.consume(testKey, 2)
                .then((result) => {
                    expect(result.consumedPoints).to.equal(2);
                    done(Error('must not resolve'));
                })
                .catch((err) => {
                    expect(err.msBeforeNext > 1000).to.equal(true);
                    done();
                });

        });
        
      });

    it('return correct data with _getRateLimiterRes', () => {
        const testKey = 'test';
        
        const rateLimiter = new RateLimiterDynamo({
            storeClient: dynamoClient,
            points: 5,
        },
        () => {
            
            const res = rateLimiter._getRateLimiterRes(
                'test',
                1,
                { key: 'test', points: 3, expire: Date.now() + 1000}
                );

            expect(res.msBeforeNext <= 1000 && 
                        res.consumedPoints === 3 && 
                        res.isFirstInDuration === false && 
                        res.remainingPoints === 2
                    ).to.equal(true);

        });
    });

    it('get points', (done) => {
        const testKey = 'get';
    
        const rateLimiter = new RateLimiterDynamo({
            storeClient: dynamoClient,
            points: 5,
        },
        () => {
            
            rateLimiter.set(testKey, 999, 10000)
                .then((data) => {
                    rateLimiter.get(testKey)
                        .then((response) => {
                            expect(response.consumedPoints).to.equal(999);
                            rateLimiter.delete(testKey);
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

    it('get points return NULL if key is not set', (done) => {
        const testKey = 'getnull';
        
        const rateLimiter = new RateLimiterDynamo({
            storeClient: dynamoClient,
            points: 5,
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
        });
        
    });

    it('delete returns false, if there is no key', (done) => {
        const testKey = 'getnull3';
        
        const rateLimiter = new RateLimiterDynamo({
            storeClient: dynamoClient,
            points: 5,
        },
        () => {
            
            rateLimiter.delete(testKey)
                .then((response) => {
                    expect(response).to.equal(false);
                    done();
                })
                .catch((err) => {
                    done(err);
                });
        });
        
    });
    
});
