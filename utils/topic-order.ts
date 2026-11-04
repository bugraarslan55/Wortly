/** Verilen id'li konuyu listenin başına alır; diğer konuların sırası aynen korunur. Girdi değiştirilmez. */
export function moveTopicFirst<T extends { id: string }>(topics: readonly T[], id: string): T[] {
  const index = topics.findIndex(topic => topic.id === id);
  if (index <= 0) return [...topics];
  return [topics[index]!, ...topics.slice(0, index), ...topics.slice(index + 1)];
}
