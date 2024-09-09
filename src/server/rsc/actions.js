let counter = 0;

export async function getCounter() {
  return counter;
}

export function changeCounter(formData) {
  counter += Number(formData.get("delta"));
  return counter;
}
