const allData = {
  window: {
    document: {
      querySelectorAll: (query) => {
        if (query === '.profile__event') {
          return [{
            querySelector: (singleQuery) => {
              if (singleQuery === '.profile__event-time') {
                return {
                  textContent: '2022-08-08',
                };
              }

              if (singleQuery === '.profile__event-title') {
                return {
                  textContent: 'EventA',
                };
              }

              return {
                textContent: 'we should not have reached here!',
              };
            },
            getAttribute: (key) => {
              if (key === 'href') {
                return 'LinkA';
              }

              return '';
            },
          }, {
            querySelector: (singleQuery) => {
              if (singleQuery === '.profile__event-time') {
                return {
                  textContent: '2022-08-11',
                };
              }

              if (singleQuery === '.profile__event-title') {
                return {
                  textContent: 'EventB',
                };
              }

              return {
                textContent: 'we should not have reached here!',
              };
            },
            getAttribute: (key) => {
              if (key === 'href') {
                return 'LinkB';
              }

              return '';
            },
          }];
        }

        if (query === '.profile__campaign') {
          return [{
            querySelector: (singleQuery) => {
              if (singleQuery === '.profile__campaign-dates') {
                return {
                  textContent: '2022-01-01',
                };
              }

              if (singleQuery === '.profile__campaign-title') {
                return {
                  textContent: 'CampaignA',
                };
              }

              return {
                textContent: 'we should not have reached here!',
              };
            },
            getAttribute: (key) => {
              if (key === 'href') {
                return 'LinkA';
              }

              return '';
            },
          }, {
            querySelector: (singleQuery) => {
              if (singleQuery === '.profile__campaign-dates') {
                return {
                  textContent: '2022-02-01',
                };
              }

              if (singleQuery === '.profile__campaign-title') {
                return {
                  textContent: 'CampaignB',
                };
              }

              return {
                textContent: 'we should not have reached here!',
              };
            },
            getAttribute: (key) => {
              if (key === 'href') {
                return 'LinkB';
              }

              return '';
            },
          }];
        }

        return [];
      },
    },
  },
};

const noData = {
  window: {
    document: {
      querySelectorAll: (query) => {
        if (query === '.profile__event') {
          return [];
        }

        if (query === '.profile__campaign') {
          return [];
        }

        return [];
      },
    },
  },
};

const futureData = {
  window: {
    document: {
      querySelectorAll: (query) => {
        if (query === '.profile__event') {
          return [{
            querySelector: (singleQuery) => {
              if (singleQuery === '.profile__event-time') {
                return {
                  textContent: '2999-08-08',
                };
              }

              if (singleQuery === '.profile__event-title') {
                return {
                  textContent: 'FutureEvent',
                };
              }

              return {
                textContent: 'we should not have reached here!',
              };
            },
            getAttribute: (key) => {
              if (key === 'href') {
                return 'LinkA';
              }

              return '';
            },
          }, {
            querySelector: (singleQuery) => {
              if (singleQuery === '.profile__event-time') {
                return {
                  textContent: '2022-08-11',
                };
              }

              if (singleQuery === '.profile__event-title') {
                return {
                  textContent: 'PastEvent',
                };
              }

              return {
                textContent: 'we should not have reached here!',
              };
            },
            getAttribute: (key) => {
              if (key === 'href') {
                return 'LinkB';
              }

              return '';
            },
          }];
        }

        if (query === '.profile__campaign') {
          return [{
            querySelector: (singleQuery) => {
              if (singleQuery === '.profile__campaign-dates') {
                return {
                  textContent: '2999-01-01',
                };
              }

              if (singleQuery === '.profile__campaign-title') {
                return {
                  textContent: 'FutureCampaign',
                };
              }

              return {
                textContent: 'we should not have reached here!',
              };
            },
            getAttribute: (key) => {
              if (key === 'href') {
                return 'LinkA';
              }

              return '';
            },
          }, {
            querySelector: (singleQuery) => {
              if (singleQuery === '.profile__campaign-dates') {
                return {
                  textContent: '2022-02-01',
                };
              }

              if (singleQuery === '.profile__campaign-title') {
                return {
                  textContent: 'PastCampaign',
                };
              }

              return {
                textContent: 'we should not have reached here!',
              };
            },
            getAttribute: (key) => {
              if (key === 'href') {
                return 'LinkB';
              }

              return '';
            },
          }];
        }

        return [];
      },
    },
  },
};

module.exports = {
  allData,
  noData,
  futureData,
};
