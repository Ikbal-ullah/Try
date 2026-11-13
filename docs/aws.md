# Deploying on AWS

This guide puts the app on **Amazon ECS Express Mode**. You give AWS a Docker image, and it creates everything a production web service needs: containers on Fargate (no servers to manage), a load balancer, an HTTPS address, automatic scaling and logs.

> **Status: written from AWS's documentation, not yet run against a real account.** The Docker image itself is built and tested. The ECR and IAM commands below are standard. The Express Mode screen is new (AWS introduced it as the replacement for App Runner, which closed to new customers in April 2026), so a field may be named slightly differently from what step 5 says.

```
Visitor ──HTTPS──▶ Load balancer ──▶ Fargate task(s) running the Docker image ──▶ AI provider
                   (AWS-managed          │
                    certificate)         ├── API key read from Parameter Store (encrypted)
                                         └── logs to CloudWatch
```

## Before you start

- **Cost.** This is not free. The load balancer and the container are billed by the hour, roughly 25 to 35 US dollars a month if left running. New accounts get credits that cover a test. **Delete everything when you are done** (last section).
- **Which account?** Sign in at <https://console.aws.amazon.com>. If you have several accounts, use any one you can sign in to as the root user or an administrator. Accounts on the newer "Free plan" can only use some services; if ECS is blocked, the console will say so.
- **Region.** Pick one region (the menu at the top right, for example `us-east-1`) and stay in it for every step.

## 1. Set a budget alert

Do this first so a forgotten service cannot surprise you.

In the console search bar open **Billing and Cost Management → Budgets → Create budget**, choose the **Zero spend budget** or a **Monthly cost budget** of a few dollars, and enter your email.

## 2. Open CloudShell

Click the terminal icon in the top bar of the console. CloudShell is a terminal in your browser that is already signed in to your account, with `git`, `docker` and the AWS command line installed. Every command below is run there.

## 3. Build the image and push it to your private registry

Get the code and set two variables used by the later commands:

```bash
git clone https://github.com/Ikbal-ullah/Try.git && cd Try
```

```bash
ACCOUNT=$(aws sts get-caller-identity --query Account --output text) && REGISTRY=$ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com && echo $REGISTRY
```

Create a private image repository that scans every image for known vulnerabilities:

```bash
aws ecr create-repository --repository-name study-assistant --image-scanning-configuration scanOnPush=true
```

Sign Docker in to it:

```bash
aws ecr get-login-password | docker login --username AWS --password-stdin $REGISTRY
```

Build and push:

```bash
docker build -t $REGISTRY/study-assistant:latest .
```

```bash
docker push $REGISTRY/study-assistant:latest
```

Print the image address; you will paste it in step 5:

```bash
echo $REGISTRY/study-assistant:latest
```

## 4. Store the API key as an encrypted secret

This asks for the key without showing it on screen or saving it in the shell history, and stores it encrypted in Parameter Store:

```bash
read -s -p "Paste your AI API key and press Enter: " KEY && aws ssm put-parameter --name /study-assistant/LLM_API_KEY --type SecureString --value "$KEY" && unset KEY
```

Print the secret's address (its ARN); you will paste it in step 5:

```bash
aws ssm get-parameter --name /study-assistant/LLM_API_KEY --query Parameter.ARN --output text
```

## 5. Create the service

1. In the console search bar open **Elastic Container Service**, then choose **Express mode** in the left menu.
2. **Image URI**: paste the image address from step 3.
3. **Task execution role** and **Infrastructure role**: choose **Create new role** for each.
4. Open the additional configuration and set:

   | Setting | Value |
   |---|---|
   | Service name | `study-assistant` |
   | Container port | `3001` |
   | Health check path | `/api/health` |
   | Environment variable `NODE_ENV` | `production` |
   | Environment variable `TRUST_PROXY` | `1` |
   | Environment variable `LLM_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta/openai` |
   | Environment variable `LLM_MODEL` | `gemini-3.5-flash-lite,gemini-2.5-flash` |
   | Secret `LLM_API_KEY` | the ARN from step 4 |
   | CPU / memory | the smallest offered (0.25 vCPU, 0.5 GB is enough) |
   | Scaling | minimum 1 task, maximum 2 |

5. **Before pressing Create**, give the new execution role permission to read the secret. In CloudShell:

   ```bash
   aws iam put-role-policy --role-name ecsTaskExecutionRole --policy-name read-study-assistant-secret --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"ssm:GetParameters\",\"Resource\":\"arn:aws:ssm:$AWS_REGION:$ACCOUNT:parameter/study-assistant/*\"}]}"
   ```

   If the role the console created has a different name, use that name instead. This grants access to this one secret and nothing else.

6. Press **Create**. After a few minutes the service shows an address of the form `https://study-assistant.ecs.<region>.on.aws`. Open it.

If the form has no field for secrets, or the task stops with an error about the secret, stop there and ask for help rather than pasting the key as a plain environment variable.

## 6. Check it

- Open `https://<your-address>/api/health`. It should show `{"ok":true}`.
- Generate a study set.
- In the ECS console open the service's **Logs** tab. Each generation writes one JSON line with a request id, the outcome and the duration. The text you typed is not in the logs.

## Updating after a code change

In CloudShell, from the `Try` folder:

```bash
git pull && docker build -t $REGISTRY/study-assistant:latest . && docker push $REGISTRY/study-assistant:latest
```

Then in the ECS console open the service and choose **Update**, keeping the same image address, so it starts new tasks from the new image. (If CloudShell was closed in between, run the `ACCOUNT=...` line and the `docker login` line from step 3 again first.)

## What scales and what does not

- **Scales**: AWS adds tasks when load rises and replaces a task that fails its health check. The server is stateless, so any task can answer any request.
- **Per task**: the rate limits and the response cache live in each task's memory. With two tasks a visitor can get up to twice the per-minute limit, and a cached answer on one task is not known to the other. Exact limits across tasks would need a shared store such as Redis (Amazon ElastiCache).
- **The real ceiling**: the AI provider's quota. A free key allows only a few generations a minute, however many tasks are running.

## Deleting everything

1. ECS console → **Express mode** → select the service → **Delete**. This removes the tasks and the load balancer, which are the parts that cost money.
2. In CloudShell:

   ```bash
   aws ecr delete-repository --repository-name study-assistant --force
   ```

   ```bash
   aws ssm delete-parameter --name /study-assistant/LLM_API_KEY
   ```

3. Check **Billing and Cost Management → Bills** the next day to confirm nothing is still running.
