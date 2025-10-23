async function fetchMCP(startDate: string, endDate: string) {
  const response = await axios.get(EPIAS_URL, {
    params: { startDate, endDate }
  });
  return response.data;
}