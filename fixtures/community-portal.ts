// HTML that follows the Community Portal profile template
// (buddypress/members/single/profile.php in mozilla/community-portal) with
// unrelated profile sections trimmed. The text the scraper reads (titles,
// times, dates) keeps the tabs and newlines the PHP template outputs.

const BASE_URL = 'https://community.mozilla.org';
const tabs = (count: number) => '\t'.repeat(count);

const locationIcon = `<svg width="16" height="18" viewBox="0 0 16 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 7.66602C14 12.3327 8 16.3327 8 16.3327" stroke="#737373"/></svg>`;
const showMoreIcon = `<svg width="8" height="10" viewBox="0 0 8 10" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.33301 8.66634L5.99967 4.99967L2.33301 1.33301" stroke="#0060DF"></path></svg>`;

interface EventFixture {
  slug: string;
  date: string;
  title: string;
  time: string;
  location?: string;
  hidden?: boolean;
}

interface CampaignFixture {
  slug: string;
  title: string;
  start: string;
  end?: string;
  tags?: string[];
  hidden?: boolean;
}

export function event({
  slug,
  date,
  title,
  time,
  location,
  hidden = false,
}: EventFixture): string {
  const hiddenClass = hidden ? ' hidden' : '';
  const locationMarkup = location
    ? `
                  <div class="profile__event-location">
                    ${locationIcon}
                    ${location}
                  </div>`
    : '';

  return `
              <a class="profile__event${hiddenClass}" href="${BASE_URL}/events/${slug}">
                <div class="profile__event-date">
                  ${date}
                </div>
                <div class="profile__event-info">
                  <div class="profile__event-title">
${tabs(10)}${title}${tabs(9)}</div>
                  <div class="profile__event-time">
${tabs(10)}${time}${tabs(9)}</div>${locationMarkup}
                </div>
              </a>
              <hr class="profile__group-line${hiddenClass}" />`;
}

export function campaign({
  slug,
  title,
  start,
  end,
  tags = [],
  hidden = false,
}: CampaignFixture): string {
  const hiddenClass = hidden ? ' hidden' : '';
  const dates = end
    ? `\n${tabs(9)}${start}${tabs(10)}-\n${tabs(11)}${end}${tabs(8)}`
    : `\n${tabs(9)}${start}${tabs(8)}`;
  const tagsMarkup = tags.length
    ? `
                  <div class="profile__campaign-tags">${tags
                    .map(
                      (tag) => `
                    <span class="profile__static-tag">
                      ${tag}
                    </span>`
                    )
                    .join('')}
                  </div>`
    : '';

  return `
              <a class="profile__campaign${hiddenClass}" href="${BASE_URL}/campaigns/${slug}">
                <h3 class="profile__campaign-title">${title}</h3>
                <div class="profile__campaign-dates">${dates}</div>
                <div class="profile__campaign-desc">
                  Campaign description
                </div>${tagsMarkup}
              </a>
              <hr class="profile__group-line${hiddenClass}" />`;
}

function card(heading: string, entries: string[]): string {
  if (!entries.length) {
    return '';
  }

  const showMore =
    entries.length >= 3
      ? `
              <a href="#" class="group__events-link show-more">
                View All(${entries.length})${showMoreIcon}
              </a>`
      : '';

  return `
          <h2 class="profile__heading">${heading}</h2>
          <div class="profile__card profile__card--links">${entries.join('')}${showMore}
          </div>`;
}

export function profilePage({
  events = [],
  campaigns = [],
}: { events?: string[]; campaigns?: string[] } = {}): string {
  return `<!DOCTYPE html>
<html lang="en-US">
<head>
  <meta charset="UTF-8">
  <title>User &#8211; Mozilla Community Portal</title>
</head>
<body class="members buddypress bp-user">
  <div class="profile__public-container">
  <section class="profile__section">
    <div class="profile__card">
      <div class="profile__card-header-container">
        <h1 class="profile__name">User</h1>
      </div>
    </div>${card('Recent Events', events)}${card('Campaigns Participated In', campaigns)}
  </section>
  <section class="profile__section profile__section--right">
    <div class="profile__card">
      <h2 class="profile__heading">Groups I&#039;m In</h2>
    </div>
  </section>
  </div>
</body>
</html>
`;
}

const eventA: EventFixture = {
  slug: 'event-a',
  date: 'Aug 08',
  title: 'EventA',
  time: 'August 08, 2022 ∙ 18:00',
  location: 'Online Event',
};
const eventB: EventFixture = {
  slug: 'event-b',
  date: 'Aug 11',
  title: 'EventB',
  time: 'August 11, 2022 ∙ 09:30',
  location: 'Berlin, Germany',
};
const campaignA: CampaignFixture = {
  slug: 'campaign-a',
  title: 'CampaignA',
  start: 'January 01 2022',
  tags: ['Firefox'],
};
const campaignB: CampaignFixture = {
  slug: 'campaign-b',
  title: 'CampaignB',
  start: 'February 01',
  end: 'February 28 2022',
};

export const allData = profilePage({
  events: [event(eventA), event(eventB)],
  campaigns: [campaign(campaignA), campaign(campaignB)],
});

export const noData = profilePage();

export const duplicateData = profilePage({
  events: [event(eventA), event(eventA)],
});

export const duplicateCampaignData = profilePage({
  campaigns: [campaign(campaignA), campaign(campaignA)],
});

export const futureData = profilePage({
  events: [
    event({
      ...eventB,
      slug: 'past-event',
      title: 'PastEvent',
    }),
    event({
      ...eventA,
      slug: 'future-event',
      title: 'FutureEvent',
      time: 'August 08, 2100 ∙ 18:00',
    }),
  ],
  campaigns: [
    campaign({
      ...campaignB,
      slug: 'past-campaign',
      title: 'PastCampaign',
    }),
    campaign({
      ...campaignA,
      slug: 'future-campaign',
      title: 'FutureCampaign',
      start: 'January 01 2100',
    }),
  ],
});

export const crossYearCampaignData = profilePage({
  campaigns: [
    campaign({
      slug: 'cross-year',
      title: 'CrossYearCampaign',
      start: 'December 01',
      end: 'January 15 2022',
    }),
  ],
});

// More than three entries, so the template hides the rest behind "View All".
export const hiddenEntriesData = profilePage({
  events: [
    event(eventA),
    event(eventB),
    event({
      ...eventA,
      slug: 'event-c',
      title: 'EventC',
      time: 'July 01, 2022 ∙ 12:00',
    }),
    event({
      ...eventA,
      slug: 'event-d',
      title: 'EventD',
      time: 'June 01, 2022 ∙ 12:00',
      hidden: true,
    }),
  ],
});

// The template escapes titles with esc_html.
export const escapedTitleData = profilePage({
  events: [event({ ...eventA, title: 'Firefox &amp; Friends' })],
  campaigns: [campaign({ ...campaignA, title: 'Fix &lt;bugs&gt;' })],
});

// Titles indented with spaces and wrapped across lines.
export const whitespaceTitleData = profilePage({
  events: [event({ ...eventA, title: '\n    Firefox\n    Meetup  ' })],
  campaigns: [campaign({ ...campaignA, title: '  Fix\n  bugs\t' })],
});

export const unparseableDateData = profilePage({
  events: [event({ ...eventA, time: 'not a date' })],
});

export const missingChildData = profilePage({
  events: [event(eventA).replace(/<div class="profile__event-time">/, '<div>')],
});
