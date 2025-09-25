import axios, { AxiosError, type AxiosResponse } from "axios";

const Sentry = {
  captureException: (error: unknown) => {
    console.error("Sentry error", error);
  },
};

export type ExpectedAxiosError = {
  status: "expectedError";
  error: string;
};

export type UnexpectedAxiosError = {
  status: "unexpectedError";
  error: string;
};

type SuccessAxiosResponse<TData> = {
  status: "success";
  data: TData;
};

export type SafeAxiosResponse<Data> = SuccessAxiosResponse<Data> | ExpectedAxiosError | UnexpectedAxiosError;

async function handleRequest<TData>({
  apiCall,
  expectedErrors,
}: {
  apiCall: () => Promise<AxiosResponse<TData>>;
  expectedErrors?: Map<number, string>;
}): Promise<SafeAxiosResponse<TData>> {
  try {
    const response = await apiCall();
    return {
      status: "success",
      data: response.data,
    };
  } catch (error) {
    if (error instanceof AxiosError) {
      if (expectedErrors?.has(error.response?.status)) {
        console.log("Expected Axios error", error);
        return {
          status: "expectedError",
          error: expectedErrors.get(error.response.status),
        };
      }

      Sentry.captureException(error);
      return {
        status: "unexpectedError",
        error: "An unexpected error occurred",
      };
    }

    Sentry.captureException(error);
    return {
      status: "unexpectedError",
      error: "An unexpected error occurred",
    };
  }
}

async function fetchData<TData>(status: number = 200) {
  const response = await handleRequest({
    apiCall: () => axios.get<TData>(`https://mock.httpstatus.io/${status}`),
    expectedErrors: new Map([
      [403, "Not authorized"],
      [404, "Not Found"],
    ]),
  });
  return response;
}

export function setupCounter(element: HTMLButtonElement) {
  let counter = 0;
  const setCounter = async (count: number) => {
    counter = count;
    element.innerHTML = `count is ${counter}`;

    const response = await fetchData<{ message: string }>(422);
  };
  element.addEventListener("click", () => setCounter(counter + 1));
  element.innerHTML = `count is 0`;
}
