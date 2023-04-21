export type ErrorResponse = {
  status: 'error';
  message: string;
  errors?: unknown[];
};

export type SuccessResponse = {
  status: 'success';
  message: string;
  datas?: unknown[];
};

export const logError = (location: string, error: unknown, known: boolean | 'unset' = 'unset') => {
  const time = new Date().toISOString();
  console.log(
    `❗ Error : ${time}@${location}[${known !== 'unset' ? (known ? 'known' : 'unknown') : known}] : ${error}`
  );
};
