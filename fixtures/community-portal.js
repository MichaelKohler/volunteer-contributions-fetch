// Mirror the text the Community Portal profile template renders, including the
// surrounding whitespace.
const eventTime = (time) => `\n${'\t'.repeat(10)}${time}${'\t'.repeat(9)}`;
const campaignDates = (start, end) =>
  end
    ? `\n${'\t'.repeat(9)}${start}${'\t'.repeat(10)}-\n${'\t'.repeat(11)}${end}${'\t'.repeat(8)}`
    : `\n${'\t'.repeat(9)}${start}${'\t'.repeat(8)}`;

export const allData = {
  window: {
    document: {
      querySelectorAll: (query) => {
        if (query === '.profile__event') {
          return [
            {
              querySelector: (singleQuery) => {
                if (singleQuery === '.profile__event-time') {
                  return {
                    textContent: eventTime('August 08, 2022 ∙ 18:00'),
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
            },
            {
              querySelector: (singleQuery) => {
                if (singleQuery === '.profile__event-time') {
                  return {
                    textContent: eventTime('August 11, 2022 ∙ 09:30'),
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
            },
          ];
        }

        if (query === '.profile__campaign') {
          return [
            {
              querySelector: (singleQuery) => {
                if (singleQuery === '.profile__campaign-dates') {
                  return {
                    textContent: campaignDates('January 01 2022'),
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
            },
            {
              querySelector: (singleQuery) => {
                if (singleQuery === '.profile__campaign-dates') {
                  return {
                    textContent: campaignDates('February 01', 'March 15 2022'),
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
            },
          ];
        }

        return [];
      },
    },
  },
};

export const noData = {
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

export const futureData = {
  window: {
    document: {
      querySelectorAll: (query) => {
        if (query === '.profile__event') {
          return [
            {
              querySelector: (singleQuery) => {
                if (singleQuery === '.profile__event-time') {
                  return {
                    textContent: eventTime('August 08, 2999 ∙ 18:00'),
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
            },
            {
              querySelector: (singleQuery) => {
                if (singleQuery === '.profile__event-time') {
                  return {
                    textContent: eventTime('August 11, 2022 ∙ 09:30'),
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
            },
          ];
        }

        if (query === '.profile__campaign') {
          return [
            {
              querySelector: (singleQuery) => {
                if (singleQuery === '.profile__campaign-dates') {
                  return {
                    textContent: campaignDates(
                      'January 01',
                      'February 01 2999'
                    ),
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
            },
            {
              querySelector: (singleQuery) => {
                if (singleQuery === '.profile__campaign-dates') {
                  return {
                    textContent: campaignDates('February 01', 'March 15 2022'),
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
            },
          ];
        }

        return [];
      },
    },
  },
};

const duplicateEvent = {
  querySelector: (singleQuery) => {
    if (singleQuery === '.profile__event-time') {
      return {
        textContent: eventTime('August 08, 2022 ∙ 18:00'),
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
};

export const duplicateData = {
  window: {
    document: {
      querySelectorAll: (query) => {
        if (query === '.profile__event') {
          return [duplicateEvent, { ...duplicateEvent }];
        }

        return [];
      },
    },
  },
};

const duplicateCampaign = {
  querySelector: (singleQuery) => {
    if (singleQuery === '.profile__campaign-dates') {
      return {
        textContent: campaignDates('February 01', 'March 01 2022'),
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
      return 'LinkB';
    }

    return '';
  },
};

export const duplicateCampaignData = {
  window: {
    document: {
      querySelectorAll: (query) => {
        if (query === '.profile__campaign') {
          return [duplicateCampaign, { ...duplicateCampaign }];
        }

        return [];
      },
    },
  },
};

function campaignEntity(dates, title) {
  return {
    querySelector: (singleQuery) => {
      if (singleQuery === '.profile__campaign-dates') {
        return { textContent: dates };
      }

      if (singleQuery === '.profile__campaign-title') {
        return { textContent: title };
      }

      return { textContent: 'we should not have reached here!' };
    },
    getAttribute: (key) => (key === 'href' ? `Link${title}` : ''),
  };
}

export const crossYearCampaignData = {
  window: {
    document: {
      querySelectorAll: (query) => {
        if (query === '.profile__campaign') {
          return [
            campaignEntity(
              campaignDates('December 01', 'January 15 2022'),
              'CrossYearCampaign'
            ),
          ];
        }

        return [];
      },
    },
  },
};

export const unparseableDateData = {
  window: {
    document: {
      querySelectorAll: (query) => {
        if (query === '.profile__campaign') {
          return [
            campaignEntity(campaignDates('01 janvier 2022'), 'FrenchCampaign'),
            campaignEntity(campaignDates('January 01 2022'), 'ValidCampaign'),
          ];
        }

        return [];
      },
    },
  },
};

export const missingChildData = {
  window: {
    document: {
      querySelectorAll: (query) => {
        if (query === '.profile__event') {
          return [
            {
              querySelector: (singleQuery) =>
                singleQuery === '.profile__event-title'
                  ? { textContent: 'EventWithoutTime' }
                  : null,
              getAttribute: () => 'LinkA',
            },
          ];
        }

        return [];
      },
    },
  },
};
