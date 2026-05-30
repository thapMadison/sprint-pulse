// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseJiraXML } from '../../src/data/parsers/xml.js';

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="0.92"><channel>
  <item>
    <key>ATL-1</key>
    <summary>Build pipeline</summary>
    <type>Story</type>
    <priority>High</priority>
    <status statusCategory="In Progress">In Progress</status>
    <assignee accountid="acc-1">Mai Pham</assignee>
    <timeoriginalestimate seconds="28800">8h</timeoriginalestimate>
    <timespent seconds="7200">2h</timespent>
    <timeestimate seconds="21600">6h</timeestimate>
    <parent key="EPIC-1" summary="Pipeline epic">EPIC-1</parent>
    <customfields>
      <customfield>
        <customfieldname>Sprint</customfieldname>
        <customfieldvalues>
          <customfieldvalue>com.atlassian.greenhopper.service.sprint.Sprint@1[id=42,state=ACTIVE,name=Sprint 24,startDate=2026-05-11T00:00:00.000Z,endDate=2026-05-29T00:00:00.000Z,goal=Ship beta]</customfieldvalue>
        </customfieldvalues>
      </customfield>
    </customfields>
  </item>
</channel></rss>`;

describe('parseJiraXML', () => {
  it('maps a Jira RSS/XML export (golden master)', () => {
    expect(parseJiraXML(SAMPLE)).toMatchSnapshot();
  });

  it('reads the greenhopper sprint blob', () => {
    const [iss] = parseJiraXML(SAMPLE);
    expect(iss.sprintName).toBe('Sprint 24');
    expect(iss.sprintStartDate).toBe('2026-05-11');
    expect(iss.sprintState).toBe('active');
    expect(iss.epicKey).toBe('EPIC-1');
  });

  it('throws when there are no <item> elements', () => {
    expect(() => parseJiraXML('<rss><channel></channel></rss>')).toThrow(/no <item>/);
  });
});
