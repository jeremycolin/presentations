---
theme: default
colorSchema: light
title: Expect your errors
class: text-left
transition: slide-left
mdc: true
---

# Expect your errors

---
layout: quote
--- 

# The problem: "Not all errors are created equal"

---
layout: center
---

# Who has been on-call here?

---
layout: image
image: /images/error-spikes.png
backgroundSize: contain
---

---
layout: center
--- 

# A short burst of errors due to a misconfigured or malicious client

<br />

## Not much we can do here but we were still paged with a `high error rate alert`


---
layout: center
--- 

# This was at Zalando where we had a fancy alerting in place called "Adpative Paging"

<br />

## It would try to automatically detect in which service the error originated from to only page that team

---
layout: center
--- 

# I was paged as a was responsible for the edge services

<br />

## The reason was simple: a downstream server marked most requests with rate limit errors (429)

---
layout: center
--- 

# You cannot really __fix__ a bad actor

<br />

## We had good protection from our CDN Web Application Firewall (WAF) but sometimes things would slip through and trigger alerts before they were mitigated

---
layout: center
--- 

# The solution?

<br />

## Intentionally marking those failed errors as __expected errors__ so they would not trigger our adaptive paging

<br />

## You still have to be careful of not creating blind spots

---
layout: center
--- 

# A similar story at Storyblok with Sentry

---
layout: image
image: /images/sentry.png
backgroundSize: contain
---

---
layout: center
--- 

# Our goal was to rely on Sentry to alert us when new issues sneaked in and resolve them quickly

<br />

## It was hard to find a threshold to trigger alerts as we had a low signal-to-noise ratio

---
layout: center
--- 

# When we started to dig deeper, we realized that we could not fix most of those errors as they could be "expected" 

<br />

## For example: someone opening a link to a space that was deleted or that they no longer have access to

<br />

## We also had a few UX bugs where the frontend was more permissive than the backend which we fixed

---

# We were using Axios for data fetching

<br />

The simplified version of the code looked more or less like this:

````md magic-move
```ts [data-client.ts] 
async function fetchData(status: number = 200) {
  try {
    const response = await axios.get(`https://mock.httpstatus.io/${status}`);
    return response.data;
  } catch (error) {
    Sentry.captureException(error)
    return null;
  }
}
```

```ts [data-client.ts]
async function fetchData(status: number = 200) {
  try {
    const response = await axios.get(`https://mock.httpstatus.io/${status}`, {
      validateStatus: (status) => status >= 200 && status < 500,
    });
    return response.data;
  } catch (error) {
    Sentry.captureException(error)
    return null;
  }
}
```
````

<br />

But there are still problems there..


---
layout: center
---

## 1. All 4xx errors are created equal again and we are blind to some actual errors

<br />

## 2. When we get an expected 4xx error, `response.data` is not probably of the shape we expect it to be

<br />

## 3. We ideally want to centralize Sentry error handling for data fetching and not disseminate it in the code

---

# Enter handleRequest

```ts [handle-request.ts] {all|5-6|9-13|15-21|23-27|30-34}{maxHeight:'400px'}
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
```

--- 

Now our previous code becomes

```ts [data-client.ts] {all|12|14}
async function fetchData(status: number = 200) {
  const response = await handleRequest({
    apiCall: () => axios.get<string>(`https://mock.httpstatus.io/${status}`),
    expectedErrors: new Map([
      [403, "Not authorized"],
      [404, "Not found"],
    ]),
  });
  return response;
}

await fetchData(404); // will send error to Sentry

await fetchData(422); // won't send error to Sentry
```

<br />

..And here is the best part

---

A little bit of TypeScript will get you a long way

<br />

```ts
type ExpectedAxiosError = {
  status: "expectedError";
  error: string;
};

type UnexpectedAxiosError = {
  status: "unexpectedError";
  error: string;
};

type SuccessAxiosResponse<TData> = {
  status: "success";
  data: TData;
};

export type SafeAxiosResponse<Data> = SuccessAxiosResponse<Data> | ExpectedAxiosError | UnexpectedAxiosError;
```

<br />

This is also referred as a Discriminated Union

---

Tying it all together:

```ts
const response = await fetchData<{ message: string }>(422);
```

![safe data fetching 1](/images/handle-request-1.png){class="max-w-[600px]"}

![safe data fetching 2](/images/handle-request-2.png){class="max-w-[600px]"}

![safe data fetching 3](/images/handle-request-3.png){class="max-w-[600px]"}


---
layout: center
---

# Happy data fetching!
