export const createChatId = (userA, userB) => {
  return [userA, userB].sort().join("_");
};
