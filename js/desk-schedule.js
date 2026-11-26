/* ═══ SCHEDULE DATA ═══ */
let EX_DT=new Date(2026,4,7);
const MN=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],DN=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const R="review",OFF="off",EX="exam",PO="post",NC="noclass";
let SCHOOLOGY_COURSE_B = '7945275782';
let SCHOOLOGY_COURSE_E = '7945275798';
const SUPABASE_URL='https://hgvnytaqmuybzbotosyj.supabase.co';
const SUPABASE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhndm55dGFxbXV5Ynpib3Rvc3lqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxNTE5MTMsImV4cCI6MjA4MDcyNzkxM30.-LcH_zly4pXoX_2Vra-RbH9twPvUj6xAJp66xPi02tU';
const _supaCache={};
function d(t,n,u,due,as,db){return{t,n,u,due:due||"",as:as||"",db:db||false,ced:typeof cedLabel==='function'?cedLabel(t):null}}
// Retain the DOK teacher/view-as gate and require the signed-in roster role.
function cedTeacherBridgeAllowed() {
    if (typeof _deskIsTeacher !== 'function' || !_deskIsTeacher()) return false;
    try {
        var who = window.rosterClient && window.rosterClient.current();
        return !!who && who.role === 'teacher';
    } catch (_) { return false; }
}
// Progress Check launch links, keyed by the calendar's PC pseudo-lesson id
// (U{u}-PCA = mid-unit MCQ Part A, U{u}-PC1 / U{u}-PC2 = end-of-unit days).
// PCs are taken in AP Classroom (College Board sign-in), never inside the Desk:
// the tile / Do Now only open the assignment. A missing key renders a
// "your teacher shares the link in class" panel, so unlinked PCs never break.
//
// Two entry shapes:
//   { url, label } or { links: [...], label }  -> the same link(s) for every period
//   { label, B: {url}|{links}, E: {url}|{links} } -> per-period links
// AP Classroom assignment ids are PER SECTION: Period B and Period E get a
// different id for the same PC. To add a unit, copy each section's id from its
// assignment URL (.../33/assessments/assignments/<id>) into that period's
// variant. Leave a period out until its id is known (its students see the
// "teacher shares the link" panel). Never guess an id.
// Units 1-5 are fully assigned for both sections. Unit 3's mid-unit MCQ Part A/B
// and Unit 4's mid-unit check are NOT assigned (no schedule date), so there is
// no U3-PCA / U4-PCA entry on purpose.
var PC_ASSIGNMENT_URL = 'https://apclassroom.collegeboard.org/33/assessments/assignments/';
var PC_LINKS = {
    'U1-PCA': { label: 'MCQ Part A',
        B: { url: PC_ASSIGNMENT_URL + '80784414' },
        E: { url: PC_ASSIGNMENT_URL + '80784578' }
    },
    'U1-PC1': { label: 'Unit 1 Progress Check — Day 1',
        B: { links: [
            { url: PC_ASSIGNMENT_URL + '81595010', label: 'MCQ Part B (14 questions)' },
            { url: PC_ASSIGNMENT_URL + '81595024', label: 'MCQ Part C (12 questions)' }
        ] },
        E: { links: [
            { url: PC_ASSIGNMENT_URL + '81743327', label: 'MCQ Part B (14 questions)' },
            { url: PC_ASSIGNMENT_URL + '81743453', label: 'MCQ Part C (12 questions)' }
        ] }
    },
    'U1-PC2': { label: 'FRQ (Day 2)',
        B: { url: PC_ASSIGNMENT_URL + '81595036' },
        E: { url: PC_ASSIGNMENT_URL + '81743492' }
    },
    'U2-PCA': { label: 'MCQ Part A',
        B: { url: PC_ASSIGNMENT_URL + '82255720' },
        E: { url: PC_ASSIGNMENT_URL + '82259752' }
    },
    'U2-PC1': { label: 'Unit 2 Progress Check — Day 1',
        B: { links: [
            { url: PC_ASSIGNMENT_URL + '82259948', label: 'MCQ Part B' },
            { url: PC_ASSIGNMENT_URL + '82260072', label: 'MCQ Part C' }
        ] },
        E: { links: [
            { url: PC_ASSIGNMENT_URL + '82259947', label: 'MCQ Part B' },
            { url: PC_ASSIGNMENT_URL + '82260070', label: 'MCQ Part C' }
        ] }
    },
    'U2-PC2': { label: 'FRQ (Day 2)',
        B: { url: PC_ASSIGNMENT_URL + '82260319' },
        E: { url: PC_ASSIGNMENT_URL + '82260482' }
    },
    'U3-PC1': { label: 'Unit 3 Progress Check — Day 1',
        B: { links: [
            { url: PC_ASSIGNMENT_URL + '82260921', label: 'MCQ Part C' },
            { url: PC_ASSIGNMENT_URL + '82261065', label: 'MCQ Part D' }
        ] },
        E: { links: [
            { url: PC_ASSIGNMENT_URL + '82260920', label: 'MCQ Part C' },
            { url: PC_ASSIGNMENT_URL + '82261064', label: 'MCQ Part D' }
        ] }
    },
    'U3-PC2': { label: 'FRQ (Day 2)',
        B: { url: PC_ASSIGNMENT_URL + '82261155' },
        E: { url: PC_ASSIGNMENT_URL + '82261154' }
    },
    'U4-PC1': { label: 'MCQ Part C (Day 1)',
        B: { url: PC_ASSIGNMENT_URL + '82261388' },
        E: { url: PC_ASSIGNMENT_URL + '82261387' }
    },
    'U4-PC2': { label: 'FRQ (Day 2)',
        B: { url: PC_ASSIGNMENT_URL + '82261590' },
        E: { url: PC_ASSIGNMENT_URL + '82261589' }
    },
    'U5-PC1': { label: 'MCQ Part A (Day 1)',
        B: { url: PC_ASSIGNMENT_URL + '82262123' },
        E: { url: PC_ASSIGNMENT_URL + '82262122' }
    },
    'U5-PC2': { label: 'FRQ (Day 2)',
        B: { url: PC_ASSIGNMENT_URL + '82262256' },
        E: { url: PC_ASSIGNMENT_URL + '82262255' }
    }
};
// One variant ({url} or {links}) as a list of {url, label}.
function _pcVariantLinks(variant, label) {
    if (!variant) return [];
    if (variant.links && variant.links.length) return variant.links;
    return variant.url ? [{ url: variant.url, label: variant.label || label }] : [];
}
// Every assignment a PC tile opens, in order, for one period ('B' | 'E').
// period defaults to the signed-in student's period. A null period (teacher,
// guest, signed out) gets both periods' links, labelled "Period B · " / "Period E · ".
function pcLinksFor(tileId, period) {
    var entry = (typeof PC_LINKS !== 'undefined') ? PC_LINKS[tileId] : null;
    if (!entry) return [];
    var perPeriod = !!(entry.B || entry.E);
    if (!perPeriod) return _pcVariantLinks(entry, entry.label);
    if (period === undefined) {
        period = (typeof _currentRosterPeriod === 'function') ? _currentRosterPeriod() : null;
    }
    if (period) return _pcVariantLinks(entry[period], entry.label);
    var both = [];
    ['B', 'E'].forEach(function (p) {
        _pcVariantLinks(entry[p], entry.label).forEach(function (link) {
            both.push({ url: link.url, label: 'Period ' + p + ' · ' + (link.label || 'Open in AP Classroom') });
        });
    });
    return both;
}
// Poster-day materials, keyed by the unit's poster tile id (U{u}-Poster; the
// later day tiles U{u}-Poster2, U{u}-Poster3 share the entry via posterLinksFor). `student`
// links render for everyone; `teacher` links render only for a signed-in
// teacher outside student preview (cedTeacherBridgeAllowed). URLs are
// repo-relative so they work on GH Pages and the Vercel mirror alike.
// `blurb` (optional) is the poster panel's sentence for that unit.
var POSTER_LINKS = {
    'U1-Poster': {
        student: [
            { label: 'Group sheets — one per trio, two pages each', url: 'u1_poster/pdf/u1_poster_group_sheets_student.pdf' },
            { label: 'Example poster — the board demo (Data, Graph, Sentence)', url: 'u1_poster/pdf/u1_poster_example_board_demo.pdf' }
        ],
        teacher: [
            { label: 'Teacher key — answers, finished graphs, scoring grid', url: 'u1_poster/pdf/u1_poster_teacher_key.pdf' }
        ]
    },
    // Periods B and E, each on its own poster days (posterDays in SCHEDULE_DEFS; U2_CLAIM_POSTER_SPEC.md B2).
    'U2-Poster': {
        student: [
            { label: 'Group sheets — one per group, two pages each', url: 'u2_poster/pdf/u2_poster_group_sheets_student.pdf' },
            { label: 'Example poster — the board demo (Claim, Proof, Repair)', url: 'u2_poster/pdf/u2_poster_example_board_demo.pdf' },
            { label: 'Poster layouts — where each part goes, with sentence frames (one page per poster)', url: 'u2_poster/pdf/u2_poster_layouts.pdf' },
            { label: 'Gallery walk sheet — one per student, last poster day', url: 'u2_poster/pdf/u2_poster_walk_sheet.pdf' }
        ],
        teacher: [
            { label: 'Teacher key — answers, run of show, scoring grid, exit tickets', url: 'u2_poster/pdf/u2_poster_teacher_key.pdf' }
        ],
        blurb: 'Groups of three. Judge your claim together first: verdict, proof, repair. Then build the poster.'
    }
};
function posterLinksFor(t) {
    if (typeof POSTER_LINKS === 'undefined' || !t) return null;
    // Every later day tile (U{u}-Poster2, U{u}-Poster3, ...) shares its unit's day-1 entry.
    return POSTER_LINKS[String(t).replace(/^(U\d+-Poster)\d+$/, '$1')] || null;
}
// Grading Model v3 (s121): inject Poster + PC Day 1 + PC Day 2 pseudo-lessons
// at every unit transition (and at the array end). generateSchedule treats
// them like lessons and places them on consecutive meeting days so each
// unit's last lesson is followed by Poster + 2-day PC before the next unit
// begins. The pseudo-lesson's `kind` ('poster' / 'pc') drives the
// distinct red-diamond / yellow-card cell styling in cls() + htm().
function injectPcPosterEvents(pacing){
    // Mid-unit MCQ Part A administration points, keyed by unit → the OLD t-id of
    // the split-point lesson (pacing keys on old ids). The Part-A tile is injected
    // right AFTER that lesson; the rest (MCQ B/C + FRQ) stays in the end-of-unit
    // block. U5 is a single end-of-unit administration → no mid-unit A (omitted).
    // Kept inside the function so the schedule-generator test can run it in
    // isolation. PC_MAKEUP_PHASE3_SCHEDULE_SPEC.md.
    const PC_MCQ_A_SPLIT={1:'1.6',2:'4.5'};
    // Poster meeting days per unit. Default 1. Unit 1 (Data, Graph, Sentence:
    // five trio posters + gallery walk) was given a second day on 2026-10-07 so
    // the PC never lands on a half-finished poster; a unit missing here is 1 day.
    const POSTER_DAYS={1:2};
    // Units that get poster days at all (one poster per quarter, 2026-10-10). The
    // poster is 30% of Work (POSTER_WORK_TRACK_SPEC.md). Unit 1 is Q1's. The
    // teacher picks each later quarter's unit from the misconception tracker, so
    // no future poster is pre-scheduled: add the unit here and regenerate
    // (scripts/build-lesson-schedule-sy2627.mjs) to schedule one.
    const POSTER_UNITS=new Set([1]);
    const out=[];
    let prevU=0;
    function appendPcPosterFor(u){
        if(POSTER_UNITS.has(u)){
            out.push({t:'U'+u+'-Poster',n:'Unit '+u+' Poster',u:u,kind:'poster'});
            if((POSTER_DAYS[u]||1)>=2)out.push({t:'U'+u+'-Poster2',n:'Unit '+u+' Poster (Day 2)',u:u,kind:'poster',admin:2});
        }
        out.push({t:'U'+u+'-PC1',n:'Unit '+u+' Progress Check (Day 1)',u:u,kind:'pc',admin:1});
        out.push({t:'U'+u+'-PC2',n:'Unit '+u+' Progress Check (Day 2)',u:u,kind:'pc',admin:2});
    }
    for(const item of pacing){
        // Transition from a real unit to anything else (next real unit OR
        // a u=0 Review block) -- flush the previous unit's Poster + PCs.
        if(prevU>0&&item.u!==prevU)appendPcPosterFor(prevU);
        out.push(item);
        // Mid-unit MCQ Part A tile, right after the unit's split-point lesson.
        // Distinct non-dot id (U{u}-PCA, not U{u}-PC1) so the lesson gate ignores
        // it and it never collides with the baseline/auto PC1 cell. prevU is left
        // untouched, so the end-of-unit flush still fires exactly once.
        if(PC_MCQ_A_SPLIT[item.u]===item.t){
            out.push({t:'U'+item.u+'-PCA',n:'Unit '+item.u+' MCQ Part A',u:item.u,kind:'pc',part:'A'});
        }
        prevU=item.u;
    }
    // Final flush if the last entry was a real unit.
    if(prevU>0)appendPcPosterFor(prevU);
    return out;
}
const SY2627_PACING_B = [
  {t:"Welcome",n:"Start Here — how grades & makeups work",u:0,kind:"orientation"},
  {t:"1.1",n:"1.1 · What Can We Learn from Data?",u:1},
  {t:"1.2",n:"1.2 · Variables",u:1},
  {t:"1.3",n:"1.3 · Tabular Representation & Summary Statistics (1 categorical)",u:1},
  {t:"1.4",n:"1.4 · Graphical Representations (1 categorical)",u:1},
  {t:"1.5",n:"1.5 · Graphical Representations (1 quantitative)",u:1},
  {t:"1.6",n:"1.6 · Descriptions for 1-Quantitative Distributions",u:1},
  {t:"1.7",n:"1.7 · Summary Statistics (1 quantitative)",u:1},
  {t:"1.8",n:"1.8 · Graphical Representations of Summary Statistics",u:1},
  {t:"1.9",n:"1.9 · Comparisons of Distributions",u:1},
  {t:"3.1",n:"3.1 → 1.10 · Investigative Question & Data Collection",u:1},
  {t:"3.2",n:"3.2 → 1.10 · Investigative Question & Data Collection",u:1},
  {t:"3.3",n:"3.3 → 1.11 · Random Sampling",u:1},
  {t:"3.4",n:"3.4 → 1.12 · Potential Problems with Sampling",u:1},
  {t:"3.5",n:"3.5 → 1.13 · Experimental Design",u:1},
  {t:"3.6",n:"3.6 → 1.13 · Experimental Design",u:1},
  {t:"2.1",n:"2.1 · Two Categorical Variables: Tables & Graphs",u:2},
  {t:"2.2",n:"2.2 → 2.1 · Two Categorical Variables: Tables & Graphs",u:2},
  {t:"2.3",n:"2.3 → 2.2 · Two Categorical Variables: Summary Statistics",u:2},
  {t:"4.1",n:"4.1 → 2.3 · Estimating Probabilities Using Simulation",u:2},
  {t:"4.2",n:"4.2 → 2.3 · Estimating Probabilities Using Simulation",u:2},
  {t:"4.3",n:"4.3 → 2.4 · Introduction to Probability",u:2},
  {t:"4.4",n:"4.4 → 2.5 · Mutually Exclusive Events",u:2},
  {t:"4.5",n:"4.5 → 2.6 · Conditional Probability",u:2},
  {t:"4.6",n:"4.6 → 2.7 · Independent Events & Unions",u:2},
  {t:"4.7",n:"4.7 → 2.8 · Introduction to Random Variables",u:2},
  {t:"4.8",n:"4.8 → 2.9 · Parameters of Random Variables",u:2},
  {t:"4.10",n:"4.10 → 2.10 · The Binomial Distribution",u:2},
  {t:"4.11",n:"4.11 → 2.10 · The Binomial Distribution",u:2},
  {t:"1.10",n:"1.10 → 2.11 · The Normal Distribution",u:2},
  {t:"5.2",n:"5.2 → 2.11 · The Normal Distribution",u:2},
  {t:"5.1",n:"5.1 → 2.12 · Sampling Distributions & the CLT",u:2},
  {t:"5.3",n:"5.3 → 2.12 · Sampling Distributions & the CLT",u:2},
  {t:"5.4",n:"5.4 → 3.1 · Estimators",u:3},
  {t:"5.5",n:"5.5 → 3.2 · Sampling Distributions for Sample Proportions",u:3},
  {t:"6.1",n:"6.1 → 3.3 · Constructing a CI for a Proportion",u:3},
  {t:"6.2",n:"6.2 → 3.3 · Constructing a CI for a Proportion",u:3},
  {t:"6.3",n:"6.3 → 3.4 · Justifying a Claim (CI, proportion)",u:3},
  {t:"6.4",n:"6.4 → 3.5 · Setting Up a Test for a Proportion",u:3},
  {t:"6.5",n:"6.5 → 3.6 · p-Values",u:3},
  {t:"6.6",n:"6.6 → 3.7 · Carrying Out a Test for a Proportion",u:3},
  {t:"6.7",n:"6.7 → 3.8 · Potential Errors When Performing Tests",u:3},
  {t:"5.6",n:"5.6 → 3.9 · Sampling Distributions (difference of proportions)",u:3},
  {t:"6.8",n:"6.8 → 3.10 · CI (difference of two proportions)",u:3},
  {t:"6.9",n:"6.9 → 3.11 · Justifying a Claim (CI, 2 proportions)",u:3},
  {t:"6.10",n:"6.10 → 3.12 · Setting Up a Test (difference of two proportions)",u:3},
  {t:"6.11",n:"6.11 → 3.13 · Carrying Out a Test (difference of two proportions)",u:3},
  {t:"8.1",n:"8.1 → 3.14 · Setting Up a Chi-Square Test (homogeneity/independence)",u:3},
  {t:"8.4",n:"8.4 → 3.14 · Setting Up a Chi-Square Test (homogeneity/independence)",u:3},
  {t:"8.5",n:"8.5 → 3.14 · Setting Up a Chi-Square Test (homogeneity/independence)",u:3},
  {t:"8.6",n:"8.6 → 3.15 · Carrying Out a Chi-Square Test (homogeneity/independence)",u:3},
  {t:"5.7",n:"5.7 → 4.1 · Sampling Distributions for Sample Means",u:4},
  {t:"7.1",n:"7.1 → 4.2 · Constructing a CI for a Mean or Mean Difference",u:4},
  {t:"7.2",n:"7.2 → 4.2 · Constructing a CI for a Mean or Mean Difference",u:4},
  {t:"7.3",n:"7.3 → 4.3 · Justifying a Claim (CI, mean/mean difference)",u:4},
  {t:"7.4",n:"7.4 → 4.4 · Setting Up a Test for a Mean or Mean Difference",u:4},
  {t:"7.5",n:"7.5 → 4.5 · Carrying Out a Test for a Mean or Mean Difference",u:4},
  {t:"5.8",n:"5.8 → 4.6 · Sampling Distributions (difference of two means)",u:4},
  {t:"7.6",n:"7.6 → 4.7 · CI (difference of two means)",u:4},
  {t:"7.7",n:"7.7 → 4.8 · Justifying a Claim (CI, 2 means)",u:4},
  {t:"7.8",n:"7.8 → 4.9 · Setting Up a Test (difference of two means)",u:4},
  {t:"7.9",n:"7.9 → 4.10 · Carrying Out a Test (difference of two means)",u:4},
  {t:"2.4",n:"2.4 → 5.1 · Graphical Representations (two quantitative variables)",u:5},
  {t:"2.5",n:"2.5 → 5.2 · Correlation",u:5},
  {t:"2.6",n:"2.6 → 5.3 · Linear Regression Models",u:5},
  {t:"2.7",n:"2.7 → 5.4 · Residuals",u:5},
  {t:"2.8",n:"2.8 → 5.5 · Least-Squares Regression",u:5},
  {t:R,n:"Review: Units 1-2",u:0},
  {t:R,n:"Review: Units 3-4",u:0},
  {t:R,n:"Review: Unit 5 + FRQ Practice",u:0}
];

const SY2627_PACING_E = [
  {t:"Welcome",n:"Start Here — how grades & makeups work",u:0,kind:"orientation"},
  {t:"1.1",n:"1.1 · What Can We Learn from Data?",u:1},
  {t:"1.2",n:"1.2 · Variables",u:1},
  {t:"1.3",n:"1.3 · Tabular Representation & Summary Statistics (1 categorical)",u:1},
  {t:"1.4",n:"1.4 · Graphical Representations (1 categorical)",u:1},
  {t:"1.5",n:"1.5 · Graphical Representations (1 quantitative)",u:1},
  {t:"1.6",n:"1.6 · Descriptions for 1-Quantitative Distributions",u:1},
  {t:"1.7",n:"1.7 · Summary Statistics (1 quantitative)",u:1},
  {t:"1.8",n:"1.8 · Graphical Representations of Summary Statistics",u:1},
  {t:"1.9",n:"1.9 · Comparisons of Distributions",u:1},
  {t:"3.1",n:"3.1 → 1.10 · Investigative Question & Data Collection",u:1},
  {t:"3.2",n:"3.2 → 1.10 · Investigative Question & Data Collection",u:1},
  {t:"3.3",n:"3.3 → 1.11 · Random Sampling",u:1},
  {t:"3.4",n:"3.4 → 1.12 · Potential Problems with Sampling",u:1},
  {t:"3.5",n:"3.5 → 1.13 · Experimental Design",u:1},
  {t:"3.6",n:"3.6 → 1.13 · Experimental Design",u:1},
  {t:"2.1",n:"2.1 · Two Categorical Variables: Tables & Graphs",u:2},
  {t:"2.2",n:"2.2 → 2.1 · Two Categorical Variables: Tables & Graphs",u:2},
  {t:"2.3",n:"2.3 → 2.2 · Two Categorical Variables: Summary Statistics",u:2},
  {t:"4.1",n:"4.1 → 2.3 · Estimating Probabilities Using Simulation",u:2},
  {t:"4.2",n:"4.2 → 2.3 · Estimating Probabilities Using Simulation",u:2},
  {t:"4.3",n:"4.3 → 2.4 · Introduction to Probability",u:2},
  {t:"4.4",n:"4.4 → 2.5 · Mutually Exclusive Events",u:2},
  {t:"4.5",n:"4.5 → 2.6 · Conditional Probability",u:2},
  {t:"4.6",n:"4.6 → 2.7 · Independent Events & Unions",u:2},
  {t:"4.7",n:"4.7 → 2.8 · Introduction to Random Variables",u:2},
  {t:"4.8",n:"4.8 → 2.9 · Parameters of Random Variables",u:2},
  {t:"4.10",n:"4.10 → 2.10 · The Binomial Distribution",u:2},
  {t:"4.11",n:"4.11 → 2.10 · The Binomial Distribution",u:2},
  {t:"1.10",n:"1.10 → 2.11 · The Normal Distribution",u:2},
  {t:"5.2",n:"5.2 → 2.11 · The Normal Distribution",u:2},
  {t:"5.1",n:"5.1 → 2.12 · Sampling Distributions & the CLT",u:2},
  {t:"5.3",n:"5.3 → 2.12 · Sampling Distributions & the CLT",u:2},
  {t:"5.4",n:"5.4 → 3.1 · Estimators",u:3},
  {t:"5.5",n:"5.5 → 3.2 · Sampling Distributions for Sample Proportions",u:3},
  {t:"6.1",n:"6.1 → 3.3 · Constructing a CI for a Proportion",u:3},
  {t:"6.2",n:"6.2 → 3.3 · Constructing a CI for a Proportion",u:3},
  {t:"6.3",n:"6.3 → 3.4 · Justifying a Claim (CI, proportion)",u:3},
  {t:"6.4",n:"6.4 → 3.5 · Setting Up a Test for a Proportion",u:3},
  {t:"6.5",n:"6.5 → 3.6 · p-Values",u:3},
  {t:"6.6",n:"6.6 → 3.7 · Carrying Out a Test for a Proportion",u:3},
  {t:"6.7",n:"6.7 → 3.8 · Potential Errors When Performing Tests",u:3},
  {t:"5.6",n:"5.6 → 3.9 · Sampling Distributions (difference of proportions)",u:3},
  {t:"6.8",n:"6.8 → 3.10 · CI (difference of two proportions)",u:3},
  {t:"6.9",n:"6.9 → 3.11 · Justifying a Claim (CI, 2 proportions)",u:3},
  {t:"6.10",n:"6.10 → 3.12 · Setting Up a Test (difference of two proportions)",u:3},
  {t:"6.11",n:"6.11 → 3.13 · Carrying Out a Test (difference of two proportions)",u:3},
  {t:"8.1",n:"8.1 → 3.14 · Setting Up a Chi-Square Test (homogeneity/independence)",u:3},
  {t:"8.4",n:"8.4 → 3.14 · Setting Up a Chi-Square Test (homogeneity/independence)",u:3},
  {t:"8.5",n:"8.5 → 3.14 · Setting Up a Chi-Square Test (homogeneity/independence)",u:3},
  {t:"8.6",n:"8.6 → 3.15 · Carrying Out a Chi-Square Test (homogeneity/independence)",u:3},
  {t:"5.7",n:"5.7 → 4.1 · Sampling Distributions for Sample Means",u:4},
  {t:"7.1",n:"7.1 → 4.2 · Constructing a CI for a Mean or Mean Difference",u:4},
  {t:"7.2",n:"7.2 → 4.2 · Constructing a CI for a Mean or Mean Difference",u:4},
  {t:"7.3",n:"7.3 → 4.3 · Justifying a Claim (CI, mean/mean difference)",u:4},
  {t:"7.4",n:"7.4 → 4.4 · Setting Up a Test for a Mean or Mean Difference",u:4},
  {t:"7.5",n:"7.5 → 4.5 · Carrying Out a Test for a Mean or Mean Difference",u:4},
  {t:"5.8",n:"5.8 → 4.6 · Sampling Distributions (difference of two means)",u:4},
  {t:"7.6",n:"7.6 → 4.7 · CI (difference of two means)",u:4},
  {t:"7.7",n:"7.7 → 4.8 · Justifying a Claim (CI, 2 means)",u:4},
  {t:"7.8",n:"7.8 → 4.9 · Setting Up a Test (difference of two means)",u:4},
  {t:"7.9",n:"7.9 → 4.10 · Carrying Out a Test (difference of two means)",u:4},
  {t:"2.4",n:"2.4 → 5.1 · Graphical Representations (two quantitative variables)",u:5},
  {t:"2.5",n:"2.5 → 5.2 · Correlation",u:5},
  {t:"2.6",n:"2.6 → 5.3 · Linear Regression Models",u:5},
  {t:"2.7",n:"2.7 → 5.4 · Residuals",u:5},
  {t:"2.8",n:"2.8 → 5.5 · Least-Squares Regression",u:5},
  {t:R,n:"Review: Units 1-2",u:0},
  {t:R,n:"Review: Units 3-4",u:0},
  {t:R,n:"Review: Unit 5 + FRQ Practice",u:0}
];

const SCHEDULE_DEFS = {
  "SY26-27": {
    label: "Full Year 2026-27",
    school: "Lynn English High School",
    // REAL SY2627 calendar (2026-09-03): LPS district calendar
    // (lynn-public-schools-2026-2027.md) + LEHS weekly schedule + teacher
    // answers — see sy2627-calendar-intake.md. First day Wed 2026-09-02;
    // AP Statistics exam Tue 2027-05-11 (teacher-confirmed, hard end).
    // Months are 0-based ([y, m0, d]). Early-release Wednesdays are NOT
    // closures (E still meets, shortened) — only district closures go here.
    // roster-server/data/lesson-schedule.json is GENERATED from this block:
    //   node scripts/build-lesson-schedule-sy2627.mjs
    examDate: [2027, 4, 11],
    range: { start: [2026,8,2], end: [2027,4,15] },
    earlyRelease: [[2026,8,30],[2026,9,21],[2026,10,18],[2026,10,25],
      [2026,11,9],[2026,11,23],[2027,0,13],[2027,1,10],[2027,2,3],
      [2027,2,17],[2027,3,14],[2027,4,19]],
    periods: {
      B: { label:"Period B", meetsDays:[1,2,4,5], doubleDay:null, workDayFrom:[2026,8,14], workDayGap:2, maxWorkDaysPerWeek:1, schoologyCourse:null,
           // Section-only breaks: nothing placed, pacing shifts one meeting later. 2026-09-18 = AP Classroom down (teacher).
           breakDays:[[2026,8,18]],
           // Section-only poster days, keyed by unit: the same rule as breakDays under a poster tile (nothing placed
           // from pacing, pacing shifts later, E untouched; U2_CLAIM_POSTER_SPEC.md B1). Teacher 2026-11-06, the Unit 2
           // claim posters: "Tuesday, Thursday & then gallery walk on Friday" (BPE walkthrough Thu 11/12).
           // Teacher 2026-11-13: "Monday for B, students will finish the poster", so a fourth day, Mon 11/16.
           // Teacher 2026-11-17: "we're not doing the lesson today, just finishing up the poster instead.
           // 2.10 starts on Thursday", so a fifth day, Tue 11/17; 2.10 starts Thu 11/19.
           posterDays:{2:[[2026,10,10],[2026,10,12],[2026,10,13],[2026,10,16],[2026,10,17]]} },
      E: { label:"Period E", meetsDays:[1,3,5], doubleDay:3, doubleFrom:[2026,8,16], maxPairsPerWeek:2, videoCapMin:30, videoCapEarlyReleaseMin:20, schoologyCourse:null,
           // A pair day lists at most 3 videos (teacher 2026-11-06: 2.7 + 2.8 put 5 videos on one Friday,
           // "not enough time, or attention span"). Counted from the Desk's RESOURCES list, from this
           // date on, so every earlier pair keeps its date (E_PAIRING_V2_SPEC.md §4).
           maxVideosPerDay:3, maxVideosFrom:[2026,10,6],
           // SAT Day Wed 2026-10-21 (teacher 2026-09-22): E does not meet for a lesson; pacing shifts one meeting later.
           // Fri 2026-11-13 (teacher 2026-11-14): a free day for E, no lesson; pacing shifts one meeting later.
           breakDays:[[2026,9,21],[2026,10,13]],
           // Section-only poster days, the same rule as B's above. Teacher 2026-11-14: the Unit 2 claim posters
           // start for Period E Mon 11/16 (11/13 was a free day) and finish Fri 11/20; 2.10 resumes Mon 11/23.
           posterDays:{2:[[2026,10,16],[2026,10,18],[2026,10,20]]} }
    },
    daysOff: [
      [[2026,8,4]],                    // School Closed (Fri Sep 4)
      [[2026,8,7]],                    // Labor Day
      [[2026,9,12]],                   // Indigenous Peoples' Day
      [[2026,10,3]],                   // Teacher in-service (no students)
      [[2026,10,11]],                  // Veterans Day
      [[2026,10,26],[2026,10,27]],     // Thanksgiving Recess (Nov 25 is a half day, in session)
      [[2026,11,24],[2026,11,25]],     // School Closed Dec 24-25 (Dec 23 is a half day, in session)
      [[2026,11,28],[2027,0,1]],       // Winter Recess
      [[2027,0,18]],                   // MLK Jr. Day
      [[2027,1,15],[2027,1,19]],       // February Vacation
      [[2027,2,26]],                   // Good Friday
      [[2027,3,19],[2027,3,23]],       // April Vacation
      [[2027,4,31]]                    // Memorial Day
    ],
    pacing: { B: injectPcPosterEvents(SY2627_PACING_B), E: injectPcPosterEvents(SY2627_PACING_E) },
    units: [
      {id:1,label:"Exploring Data & Collecting"},{id:2,label:"Probability & Distributions"},
      {id:3,label:"Inference: Proportions"},{id:4,label:"Inference: Means"},
      {id:5,label:"Regression"}
    ],
    _legacyS: null
  }
};
let S = [];
// Date-driven default: summer prep now, auto-roll to SY26-27 once that school year begins.
function computeDefaultYear(){
  // DN3c / decision D5: ONE school-year calendar. The summer-prep value is
  // preserved by DN3b ahead-coloring + the Do Now earliest-gap walk, not a
  // separate schedule. The SUMMER26 and SY25-26 calendars are developer reference
  // only (scripts/schedule-archive/legacy-schedule-defs.mjs): no page loads them.
  return "SY26-27";
}
let cYear = computeDefaultYear();

// Explicit groups use individual OLD keys. Archived joined strings keep their legacy behavior.
function groupTopics(cell){
  if(!cell)return [];
  if(typeof cell==='string'){
    if((typeof cYear==='undefined'||cYear==='SY26-27')&&typeof S!=='undefined'){
      for(const row of S){
        for(const candidate of [row[3],row[4]]){
          if(candidate&&candidate.t===cell&&Array.isArray(candidate.group))return groupTopics(candidate);
        }
      }
    }
    return [cell];
  }
  if(Array.isArray(cell.group))return cell.group.flatMap(groupTopics);
  return cell.t?[cell.t]:[];
}

function groupLabel(cell){
  const labels=groupTopics(cell).map(topic=>cedLabel(topic));
  return {text:labels.map(label=>label.text).join(' + '),unit:labels[0]&&labels[0].unit,
    bonus:labels.length>0&&labels.every(label=>label.bonus)};
}

function dateFromArr(a){return new Date(a[0],a[1],a[2])}

function buildOffSet(daysOff){
  const s=new Set();
  for(const e of daysOff){
    if(e.length===1){const[y,m,d]=e[0];s.add(y+'-'+m+'-'+d)}
    else{const st=dateFromArr(e[0]),en=dateFromArr(e[1]);
      for(let dt=new Date(st);dt<=en;dt.setDate(dt.getDate()+1))
        if(dt.getDay()>=1&&dt.getDay()<=5) s.add(dt.getFullYear()+'-'+dt.getMonth()+'-'+dt.getDate());
    }
  }
  return s;
}

function enumWeekdays(startArr,endArr){
  const days=[],st=dateFromArr(startArr),en=dateFromArr(endArr);
  for(let dt=new Date(st);dt<=en;dt.setDate(dt.getDate()+1))
    if(dt.getDay()>=1&&dt.getDay()<=5) days.push(new Date(dt));
  return days;
}

// GENERATED from data/video-minutes.json by scripts/build-video-minutes-const.mjs — do not hand-edit.
const VIDEO_MINUTES = {"1.1":6.7,"1.2":9.3,"1.3":8.3,"1.4":18.1,"1.5":8.7,"1.6":6.7,"1.7":18.4,"1.8":8.1,"1.9":8.9,"1.10":26.9,"2.1":7.7,"2.2":8.5,"2.3":9.2,"2.4":15.7,"2.5":7,"2.6":18.1,"2.7":10.6,"2.8":23.7,"2.9":12.9,"3.1":5.5,"3.2":8.3,"3.3":19.9,"3.4":7.4,"3.5":24.4,"3.6":12.8,"3.7":6.2,"4.1":5.3,"4.2":15.4,"4.3":8.8,"4.4":5.9,"4.5":8.5,"4.6":15.2,"4.7":13.2,"4.8":6.8,"4.9":13.1,"4.10":9.9,"4.11":7.1,"4.12":11,"5.1":7.9,"5.2":19.5,"5.3":11.6,"5.4":5.4,"5.5":12.8,"5.6":18.6,"5.7":14.6,"5.8":16.2,"6.1":9.1,"6.2":24.2,"6.3":22.9,"6.4":16.7,"6.5":16.4,"6.6":18.8,"6.7":14.7,"6.8":17.5,"6.9":16.7,"6.10":19.2,"6.11":29.9,"7.1":8.8,"7.2":26.8,"7.3":26.1,"7.4":14.9,"7.5":26.8,"7.6":17.2,"7.7":17,"7.8":13.6,"7.9":24.2,"7.10":23.8,"8.1":7.5,"8.2":25.1,"8.3":29,"8.4":8.6,"8.5":8.5,"8.6":28.4,"8.7":8.3,"9.1":6.9,"9.2":30.1,"9.3":15.3,"9.4":15.5,"9.5":24.8,"9.6":9.1};

function generateSchedule(def){
  // A section-only break must not move the OTHER section by a single day: that
  // section's cells come from a reference run with every breakDays list removed,
  // and its placements feed the lead exactly as they did without the break.
  // Section-only poster days (posterDays, U2_CLAIM_POSTER_SPEC.md B1) count as breaks here.
  const hasPosterDays=p=>!!(p.posterDays&&Object.values(p.posterDays).some(days=>days&&days.length));
  const hasBreak=pid=>{const p=def.periods[pid];return !!(p&&((p.breakDays&&p.breakDays.length)||hasPosterDays(p)))};
  // Both sections have breaks (first time: B 2026-09-18 + E SAT Day 2026-10-21):
  // each section's column comes from a run where ONLY its own breaks exist, so
  // neither section's break can move the other (B's Work-Day rule would otherwise
  // react to E's shifted pacing). Each sub-run has one break list → the
  // single-break path below, so the B column is byte-identical to before.
  if(hasBreak('B')&&hasBreak('E')){
    // A section-only pacing adjustment (its breaks and poster days, E's video-count cap) exists only in its own
    // run, so B's Work-Day rule never reacts to it (E_PAIRING_V2_SPEC.md §4).
    const without=drop=>{const periods={};for(const pid in def.periods){periods[pid]={...def.periods[pid]};if(pid===drop){delete periods[pid].breakDays;delete periods[pid].posterDays;delete periods[pid].maxVideosPerDay;delete periods[pid].maxVideosFrom}}return {...def,periods}};
    const runB=generateSchedule(without('E')),runE=generateSchedule(without('B'));
    return runB.map((row,i)=>[row[0],row[1],row[2],row[3],runE[i][4]]);
  }
  let ref=null;
  if(['B','E'].some(hasBreak)){
    // The reference run has no section-only adjustment at all (no breaks, no poster days, no E video-count cap):
    // the non-break section's cells come from it, and the break section's placements react to it.
    const periods={};
    for(const pid in def.periods){periods[pid]={...def.periods[pid]};delete periods[pid].breakDays;delete periods[pid].posterDays;delete periods[pid].maxVideosPerDay;delete periods[pid].maxVideosFrom}
    ref=generateSchedule({...def,periods});
  }
  const offSet=buildOffSet(def.daysOff);
  const earlyRelease=new Set((def.earlyRelease||[]).map(day=>day.join('-')));
  const allDays=enumWeekdays(def.range.start,def.range.end);
  const queues={};
  for(const pid in def.periods) queues[pid]=[...def.pacing[pid]];
  const result=[],examDt=dateFromArr(def.examDate);
  let placedB=0,placedE=0,pairsThisWeek=0,workDaysThisWeek=0,weekKey='';
  for(const dt of allDays){
    const dow=dt.getDay();
    const monday=new Date(dt);
    monday.setDate(monday.getDate()-dow+1);
    const currentWeek=monday.getFullYear()+'-'+monday.getMonth()+'-'+monday.getDate();
    if(currentWeek!==weekKey){weekKey=currentWeek;pairsThisWeek=0;workDaysThisWeek=0}
    const da=[dt.getFullYear(),dt.getMonth(),dt.getDate()];
    const dk=da.join('-');
    if(offSet.has(dk)){result.push([...da,OFF,OFF]);continue}
    if(dt>=examDt){const isEx=dt.getTime()===examDt.getTime();result.push([...da,isEx?EX:PO,isEx?EX:PO]);continue}
    const cells={};
    const refRow=ref?ref.find(r=>r[0]===da[0]&&r[1]===da[1]&&r[2]===da[2]):null;
    for(const pid of ['B','E']){
      const pDef=def.periods[pid];
      if(!pDef)continue;
      if(refRow&&!hasBreak(pid)){
        const cell=refRow[pid==='B'?3:4];
        cells[pid]=cell;
        if(cell&&typeof cell==='object'&&cell.kind!=='work'){
          const n=Array.isArray(cell.group)?cell.group.length:1;
          if(pid==='B')placedB+=n; else placedE+=n;
        }
        continue;
      }
      if(!pDef.meetsDays.includes(dow)) cells[pid]=NC;
      else if(queues[pid].length>0){
        // A section-only break: nothing placed, nothing consumed, the lead is unchanged.
        if(pDef.breakDays&&pDef.breakDays.some(day=>day.join('-')===dk)){
          cells[pid]={t:pid+'-Break',n:'Break Day',u:0,kind:'break',due:'',as:''};
          continue;
        }
        // A section-only poster day: the same rule as a break, under a poster tile (U{u}-Poster,
        // U{u}-Poster2, ...). Checked before the Work-Day rule, so a poster day is never a Work Day.
        const posterUnit=Object.keys(pDef.posterDays||{}).find(u=>pDef.posterDays[u].some(day=>day.join('-')===dk));
        if(posterUnit){
          const days=pDef.posterDays[posterUnit];
          const admin=days.findIndex(day=>day.join('-')===dk)+1;
          cells[pid]={t:'U'+posterUnit+'-Poster'+(admin>1?admin:''),n:'Unit '+posterUnit+' Poster'+(admin>1?' (Day '+admin+')':''),
            u:Number(posterUnit),kind:'poster',admin,days:days.length,sectionOnly:true,due:'',as:''};
          continue;
        }
        // Count the lead before B places anything today; work does not consume pacing.
        if(pid==='B'&&pDef.workDayFrom&&dt>=dateFromArr(pDef.workDayFrom)
          &&placedB-placedE>=pDef.workDayGap&&workDaysThisWeek<pDef.maxWorkDaysPerWeek
          &&!queues[pid][0].kind){
          cells[pid]={t:'B-Work',n:'Work Day',u:0,kind:'work',due:'',as:''};
          workDaysThisWeek++;
          continue;
        }
        const tp=queues[pid].shift();
        if(pid==='B')placedB++;
        const cell=d(tp.t,tp.n,tp.u,tp.due||"",tp.as||"",tp.db||false);
        if(tp.kind){cell.kind=tp.kind;if(tp.admin)cell.admin=tp.admin;if(tp.part)cell.part=tp.part}
        const next=queues[pid][0];
        const cap=earlyRelease.has(dk)&&dow===3?pDef.videoCapEarlyReleaseMin:pDef.videoCapMin;
        const pairDay=pid==='E'&&pDef.doubleFrom&&dt>=dateFromArr(pDef.doubleFrom)
          &&placedE+1<placedB&&pairsThisWeek<pDef.maxPairsPerWeek;
        // Video-count cap (teacher 2026-11-06, E_PAIRING_V2_SPEC.md §4): from maxVideosFrom on, the
        // two topics may list at most maxVideosPerDay videos in the Desk's RESOURCES panel. A topic
        // with no RESOURCES entry never pairs, like one with no VIDEO_MINUTES entry.
        const countCapOn=!!(pDef.maxVideosPerDay&&pDef.maxVideosFrom&&dt>=dateFromArr(pDef.maxVideosFrom));
        const videoCount=t=>{const r=typeof RESOURCES!=='undefined'&&RESOURCES[String(t).replace('.','-')];return r&&Array.isArray(r.videos)?r.videos.length:Infinity};
        if(pairDay&&!tp.kind&&tp.u>0&&next&&!next.kind&&next.u===tp.u
          &&(VIDEO_MINUTES[tp.t]??Infinity)+(VIDEO_MINUTES[next.t]??Infinity)<=cap
          &&(!countCapOn||videoCount(tp.t)+videoCount(next.t)<=pDef.maxVideosPerDay)){
          queues[pid].shift();
          const second=d(next.t,next.n,next.u,next.due||"",next.as||"",next.db||false);
          const group=d(cell.t+'+'+second.t,cell.n+' + '+second.n,cell.u,'','',true);
          group.group=[cell,second];
          cells[pid]=group;
          placedE++;
          pairsThisWeek++;
        }else cells[pid]=cell;
        if(pid==='E')placedE++;
      }
      else cells[pid]=NC;
    }
    result.push([...da,cells.B||NC,cells.E||NC]);
  }
  return result;
}

function loadYear(yearKey){
  const def=SCHEDULE_DEFS[yearKey];
  if(!def) return;
  cYear=yearKey;
  if(def._legacyS) S=def._legacyS;
  else{
    const saved=loadScheduleEdits(yearKey);
    if(saved){const ed=applyEdits(def,saved);S=generateSchedule(ed)}
    else S=generateSchedule(def);
  }
  EX_DT=dateFromArr(def.examDate);
  updateInfoBar(def);
  updateLegend(def);
  SCHOOLOGY_COURSE_B=def.periods.B.schoologyCourse||'';
  SCHOOLOGY_COURSE_E=def.periods.E.schoologyCourse||'';
  rCD();rCal();rProg();
  // The calendar (global S) is now generated — recompute the Grade Check-in
  // periods so a schedule change re-derives due dates (self-gated to teachers).
  try { if (typeof _renderGradeCheckinUI === 'function') _renderGradeCheckinUI(); } catch (_) {}
  try { if (typeof _loadBulletin === 'function') _loadBulletin(); } catch (_) {}
  localStorage.setItem('ap-roadmap-year',yearKey);
  var pu=new URL(window.location);
  pu.searchParams.set('year',yearKey);
  history.replaceState(null,'',pu);
  if(def.periods[cP]&&def.periods[cP].schoologyCourse){
    loadSupabaseOverlay(cP).then(()=>{rCal();rProg()});
  }
  updateViewMenu();
}
