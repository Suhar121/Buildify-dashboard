const TEAM_MEMBERS = [
  'Suhar Yasee',
  'Shahbaz',
  'Kashif',
  'Mushtaq',
  'Khubaib',
  'Aalim Aslam',
  'Anas Shiraz',
  'Urva Hafiz'
];

const TEAM_MEMBER_LOOKUP = new Map(
  TEAM_MEMBERS.map((name) => [name.toLowerCase(), name])
);

function normalizeMemberName(value) {
  if (Array.isArray(value)) {
    return value.map(v => normalizeMemberName(v)).filter(Boolean);
  }
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return TEAM_MEMBER_LOOKUP.get(trimmed.toLowerCase()) || null;
}

module.exports = {
  TEAM_MEMBERS,
  normalizeMemberName
};
