export const PRIMARY_DEMO_CONTACT_ID = 'person_demo_lilei';
export const PRIMARY_DEMO_EVENT_ID = 'event_demo_campaign';

export const DEMO_NETWORK_CONTACTS = Object.freeze([
  {
    personId: PRIMARY_DEMO_CONTACT_ID,
    name: 'Minghan Xiao',
    tags: ['london-hackathon', 'imperial', 'organiser', 'builder-community', 'tianjin', 'ic'],
    notes: 'London hackathon organiser at Imperial College. From Tianjin, China. Very nice guy. Shared both his X and LinkedIn.',
    updatedAtOffsetMinutes: -20,
    nextFollowUpOffsetMinutes: 2 * 24 * 60,
    identities: [
      {
        identityId: 'identity_demo_minghan_x',
        platform: 'x',
        handle: '@mingthemerxiles',
        url: 'https://x.com/mingthemerxiles?s=21',
        note: 'Public X profile',
      },
      {
        identityId: 'identity_demo_minghan_linkedin',
        platform: 'linkedin',
        handle: '',
        url: 'https://www.linkedin.com/in/minghan-xiao-b36678236/',
        note: 'Public LinkedIn profile',
      },
    ],
    interactions: [
      {
        interactionId: 'interaction_demo_minghan_intro',
        happenedAtOffsetMinutes: -140,
        summary: 'Met through London hackathon organising circles at Imperial College.',
        evidence: 'From Tianjin, China, and easy to collaborate with.',
      },
      {
        interactionId: 'interaction_demo_minghan_followup',
        happenedAtOffsetMinutes: -80,
        summary: 'Talked about builder communities, operator dashboards, and how SocialOS could support organiser follow-up.',
        evidence: 'Shared his X and LinkedIn and felt like a natural design-partner contact for the demo loop.',
      },
    ],
  },
  {
    personId: 'person_demo_shafi_maahe',
    name: 'Shafi Maahe',
    tags: ['london-hackathon', 'imperial', 'organiser', 'openclaw'],
    notes: 'London hackathon organiser at Imperial College. Interviewed Peter, the creator of OpenClaw.',
    updatedAtOffsetMinutes: -30,
    identities: [],
    interactions: [
      {
        interactionId: 'interaction_demo_shafi_intro',
        happenedAtOffsetMinutes: -120,
        summary: 'Met in the London hackathon organiser circle at Imperial College.',
        evidence: 'Shared context around community building and the Peter, creator of OpenClaw, interview.',
      },
    ],
  },
  {
    personId: 'person_demo_candice_tang',
    name: 'Candice Tang',
    tags: ['lawyer', 'ip', 'cross-border', 'partner', 'chengdu'],
    notes: 'Independent lawyer focused on cross-border and intellectual property work. Met through a Chamber of Commerce event in Chengdu. Later visited her office and she treated me to a meal. Trusted partner contact.',
    updatedAtOffsetMinutes: -40,
    nextFollowUpOffsetMinutes: 5 * 24 * 60,
    identities: [
      {
        identityId: 'identity_demo_candice_linkedin',
        platform: 'linkedin',
        handle: '',
        url: 'https://www.linkedin.com/in/candicetangyueyun/',
        note: 'Public LinkedIn profile',
      },
    ],
    interactions: [
      {
        interactionId: 'interaction_demo_candice_intro',
        happenedAtOffsetMinutes: -260,
        summary: 'Met at a Chamber of Commerce event in Chengdu.',
        evidence: 'Independent lawyer with cross-border and IP focus who later showed me her office and hosted a meal.',
      },
    ],
  },
  {
    personId: 'person_demo_james_wu',
    name: 'James Wu',
    tags: ['nvidia', 'industry', 'entrepreneurship', 'sf', 'tianjin-university', 'ihealth'],
    notes: 'Vice President at NVIDIA. Met in San Francisco in summer 2025 at iHealth. Tianjin University alumnus who shared his entrepreneurship story and how he got into NVIDIA.',
    updatedAtOffsetMinutes: -50,
    nextFollowUpOffsetMinutes: 7 * 24 * 60,
    identities: [
      {
        identityId: 'identity_demo_james_wu_linkedin',
        platform: 'linkedin',
        handle: '',
        url: 'https://www.linkedin.com/in/james-wu-21927a2/',
        note: 'Public LinkedIn profile',
      },
    ],
    interactions: [
      {
        interactionId: 'interaction_demo_james_wu_intro',
        happenedAtOffsetMinutes: -320,
        summary: 'Met at iHealth in San Francisco during summer 2025.',
        evidence: 'Talked about entrepreneurship, how he got into NVIDIA, and the Tianjin University alumni connection.',
      },
    ],
  },
  {
    personId: 'person_demo_daniel_dandrea',
    name: "Daniel D'Andrea",
    tags: ['bristol', 'teaching', 'data-science', 'italy'],
    notes: 'Senior Lecturer at the University of Bristol. We collaborate on Data Science: Methods and Practice. He is from Italy and we worked well together on teaching.',
    updatedAtOffsetMinutes: -60,
    identities: [
      {
        identityId: 'identity_demo_daniel_linkedin',
        platform: 'linkedin',
        handle: '',
        url: 'https://www.linkedin.com/in/daniel-d-andrea-8a82244/',
        note: 'Public LinkedIn profile',
      },
    ],
    interactions: [
      {
        interactionId: 'interaction_demo_daniel_teaching',
        happenedAtOffsetMinutes: -440,
        summary: 'Collaborated on Data Science: Methods and Practice teaching.',
        evidence: 'Strong Bristol teaching collaboration and practical course delivery; we did a great job together.',
      },
    ],
  },
  {
    personId: 'person_demo_james_sibson',
    name: 'James Sibson',
    tags: ['babcock', 'defence', 'research-industry', 'exeter', 'mini-drones'],
    notes: 'Met at an Exeter research-industry programme focused on mini drones for tank detection. He works at Babcock.',
    updatedAtOffsetMinutes: -70,
    identities: [
      {
        identityId: 'identity_demo_james_sibson_linkedin',
        platform: 'linkedin',
        handle: '',
        url: 'https://www.linkedin.com/in/james-sibson-532729aa/',
        note: 'Public LinkedIn profile',
      },
    ],
    interactions: [
      {
        interactionId: 'interaction_demo_james_sibson_intro',
        happenedAtOffsetMinutes: -520,
        summary: 'Met through the Exeter research-industry programme.',
        evidence: 'Discussed mini drones for tank detection and industry collaboration.',
      },
    ],
  },
  {
    personId: 'person_demo_clare_rees_zimmerman',
    name: 'Clare Rees-Zimmerman',
    tags: ['bath', 'chemical-engineering', 'research-industry', 'exeter', 'alan-champneys', 'matt-hennessy'],
    notes: 'Met on the same Exeter research-industry programme. She is now a lecturer in chemical engineering at Bath and knows Alan Champneys and Matt Hennessy.',
    updatedAtOffsetMinutes: -80,
    identities: [],
    interactions: [
      {
        interactionId: 'interaction_demo_clare_intro',
        happenedAtOffsetMinutes: -540,
        summary: 'Met during the Exeter research-industry programme.',
        evidence: 'Chemical engineering lecturer at Bath with shared research-industry context and links back into the Bristol teaching circle.',
      },
    ],
  },
  {
    personId: 'person_demo_alan_champneys',
    name: 'Alan Champneys',
    tags: ['bristol', 'professor', 'mdm3', 'math-modelling'],
    notes: 'Professor at the University of Bristol and unit director for MDM3 Mathematical and Data Modelling.',
    updatedAtOffsetMinutes: -90,
    identities: [
      {
        identityId: 'identity_demo_alan_linkedin',
        platform: 'linkedin',
        handle: '',
        url: 'https://www.linkedin.com/in/alan-champneys-202a3244/',
        note: 'Public LinkedIn profile',
      },
    ],
    interactions: [
      {
        interactionId: 'interaction_demo_alan_course',
        happenedAtOffsetMinutes: -600,
        summary: 'Connected through the MDM3 teaching context at Bristol.',
        evidence: 'Unit director for the Mathematical and Data Modelling course.',
      },
    ],
  },
  {
    personId: 'person_demo_matt_hennessy',
    name: 'Matt Hennessy',
    tags: ['bristol', 'senior-lecturer', 'mdm3', 'teaching'],
    notes: 'Senior Lecturer at the University of Bristol. We worked on the same MDM3 course together.',
    updatedAtOffsetMinutes: -100,
    identities: [],
    interactions: [
      {
        interactionId: 'interaction_demo_matt_course',
        happenedAtOffsetMinutes: -620,
        summary: 'Worked on the same Bristol course together.',
        evidence: 'Part of the MDM3 teaching circle with Alan Champneys and Daniel D’Andrea.',
      },
    ],
  },
  {
    personId: 'person_demo_xiyue_zhang',
    name: 'Xiyue Zhang',
    tags: ['bristol', 'lecturer', 'dynamics', 'merchant-venturers'],
    notes: 'Lecturer at the University of Bristol. Met in the EngiMath staff kitchen during a dynamics workshop. Shared her first-year experiences. I want to invite her for lunch or dinner. Office is in the Merchant Venturers Building.',
    updatedAtOffsetMinutes: -110,
    nextFollowUpOffsetMinutes: 3 * 24 * 60,
    identities: [],
    interactions: [
      {
        interactionId: 'interaction_demo_xiyue_workshop',
        happenedAtOffsetMinutes: -700,
        summary: 'Met at a dynamics workshop in the EngiMath staff kitchen.',
        evidence: 'Talked about her first year at Bristol and the idea of inviting her for lunch or dinner.',
      },
    ],
  },
  {
    personId: 'person_demo_michele_barbour',
    name: 'Michele Barbour',
    tags: ['enterprise', 'innovation', 'bristol', 'ecef'],
    notes: 'Associate Pro Vice-Chancellor for Enterprise and Innovation. Organises Early Career Enterprise Fellows, and I am one of the recipients.',
    updatedAtOffsetMinutes: -120,
    nextFollowUpOffsetMinutes: 10 * 24 * 60,
    identities: [],
    interactions: [
      {
        interactionId: 'interaction_demo_michele_intro',
        happenedAtOffsetMinutes: -820,
        summary: 'Met through the Early Career Enterprise Fellows context.',
        evidence: 'Important enterprise and innovation connector at Bristol.',
      },
    ],
  },
  {
    personId: 'person_demo_stefan_dienstag',
    name: 'Stefan Dienstag',
    tags: ['bristol', 'ai', 'nucleate', 'community'],
    notes: 'Met at a Bristol AI activity through Nucleate, where he was chairing.',
    updatedAtOffsetMinutes: -130,
    identities: [],
    interactions: [
      {
        interactionId: 'interaction_demo_stefan_intro',
        happenedAtOffsetMinutes: -900,
        summary: 'Met at a Bristol AI activity through Nucleate.',
        evidence: 'He was chairing the session and sits in the Bristol AI community.',
      },
    ],
  },
]);

export const DEMO_NETWORK_EVENTS = Object.freeze([
  {
    eventId: PRIMARY_DEMO_EVENT_ID,
    title: 'London hackathon organiser follow-up',
    createdAtOffsetMinutes: -70,
    payload: {
      audience: 'builders and community organisers',
      language: 'bilingual',
      tone: 'clear and warm',
      links: ['https://zhouyixiaoxiao.org/deck'],
      assets: ['asset_demo_card'],
      details: {
        summary: 'Turned one London organiser conversation into a SocialOS follow-up, draft, and reflection loop.',
        focus: 'hackathons, builder communities, and operator dashboards',
      },
    },
    people: [PRIMARY_DEMO_CONTACT_ID, 'person_demo_shafi_maahe'],
  },
  {
    eventId: 'event_demo_chengdu_chamber_circle',
    title: 'Chengdu Chamber cross-border legal follow-up',
    createdAtOffsetMinutes: -260,
    payload: {
      audience: 'cross-border founders and legal operators',
      language: 'bilingual',
      tone: 'professional and personal',
      details: {
        summary: 'Captured the Candice Tang relationship thread from a Chengdu Chamber event into a reusable follow-up context.',
      },
    },
    people: ['person_demo_candice_tang'],
  },
  {
    eventId: 'event_demo_sf_ihealth_circle',
    title: 'SF iHealth industry reflection',
    createdAtOffsetMinutes: -320,
    payload: {
      audience: 'industry operators and alumni',
      language: 'en',
      tone: 'reflective',
      details: {
        summary: 'Remembered the James Wu conversation from iHealth in San Francisco and preserved the entrepreneurship narrative.',
      },
    },
    people: ['person_demo_james_wu'],
  },
  {
    eventId: 'event_demo_bristol_teaching_circle',
    title: 'Bristol teaching collaboration circle',
    createdAtOffsetMinutes: -440,
    payload: {
      audience: 'academic collaborators',
      language: 'en',
      tone: 'grounded',
      details: {
        summary: 'Linked Daniel D’Andrea, Alan Champneys, and Matt Hennessy through the MDM3 / data science teaching surface.',
      },
    },
    people: ['person_demo_daniel_dandrea', 'person_demo_alan_champneys', 'person_demo_matt_hennessy'],
  },
  {
    eventId: 'event_demo_exeter_industry_programme',
    title: 'Exeter research-industry programme',
    createdAtOffsetMinutes: -520,
    payload: {
      audience: 'research and defence collaborators',
      language: 'en',
      tone: 'practical',
      details: {
        summary: 'Captured James Sibson and Clare Rees-Zimmerman in the same research-industry context.',
      },
    },
    people: ['person_demo_james_sibson', 'person_demo_clare_rees_zimmerman'],
  },
  {
    eventId: 'event_demo_bristol_dynamics_workshop',
    title: 'Bristol dynamics workshop',
    createdAtOffsetMinutes: -700,
    payload: {
      audience: 'academic peers',
      language: 'en',
      tone: 'light',
      details: {
        summary: 'Captured the Xiyue Zhang connection from the EngiMath staff-kitchen conversation during the dynamics workshop.',
      },
    },
    people: ['person_demo_xiyue_zhang'],
  },
  {
    eventId: 'event_demo_bristol_enterprise_ai',
    title: 'Bristol enterprise and AI community touchpoints',
    createdAtOffsetMinutes: -820,
    payload: {
      audience: 'enterprise and AI community builders',
      language: 'en',
      tone: 'operator-first',
      details: {
        summary: 'Connected Michele Barbour and Stefan Dienstag across enterprise and Bristol AI community surfaces.',
      },
    },
    people: ['person_demo_michele_barbour', 'person_demo_stefan_dienstag'],
  },
]);

export const DEMO_NETWORK_DECK_CLUSTERS = Object.freeze([
  {
    title: 'London builders',
    members: ['Minghan Xiao', 'Shafi Maahe'],
    summary: 'Imperial hackathon organisers and builder-community operators.',
  },
  {
    title: 'China and legal bridge',
    members: ['Candice Tang'],
    summary: 'Cross-border and intellectual-property counsel from Chengdu.',
  },
  {
    title: 'Industry node',
    members: ['James Wu'],
    summary: 'NVIDIA leadership and Tianjin University alumni connection from San Francisco.',
  },
  {
    title: 'Bristol teaching',
    members: ["Daniel D'Andrea", 'Alan Champneys', 'Matt Hennessy'],
    summary: 'Teaching and modelling collaborators across Bristol courses.',
  },
  {
    title: 'Research and enterprise',
    members: ['James Sibson', 'Clare Rees-Zimmerman', 'Xiyue Zhang', 'Michele Barbour', 'Stefan Dienstag'],
    summary: 'Research-industry, workshop, enterprise, and Bristol AI community links.',
  },
]);
