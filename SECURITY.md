# Security policy

## Supported versions

Only the latest release of the WebRTC Camera integration receives security fixes.
Update the integration from the Gladys store before reporting an issue.

| Version      | Supported |
| ------------ | --------- |
| 1.x (latest) | Yes       |
| older        | No        |

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Report it privately through GitHub: open the **Security** tab of
[prohand/gladys-webrtccamera](https://github.com/prohand/gladys-webrtccamera/security), then
**Report a vulnerability**.

Include, when you can:

- the version of the integration, of Gladys and of go2rtc;
- what an attacker can do, and the steps to reproduce it;
- any log line that helps (remove tokens, passwords, camera URLs and addresses first).

You should get a first answer within 7 days. A fix is released as a new version of
the integration, and the advisory is published once users can update.

## Scope

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (report to
[GladysAssistant/Gladys](https://github.com/GladysAssistant/Gladys/security)), go2rtc (report to
[AlexxIT/go2rtc](https://github.com/AlexxIT/go2rtc)) and the cameras themselves.

## What the integration does with your data

- It only talks to the go2rtc address you configure, on your network. No cloud service.
- The go2rtc password is stored in a secret field of Gladys and is never written to the logs.
- go2rtc's stream list contains the camera URLs, often with their passwords: the integration
  only keeps the stream **names**, never sends those URLs to Gladys and never logs them.
- Images are kept in memory only (the last one per camera), never written to disk.

## Good practices for users

- Protect the go2rtc API with a user name and password (`api.username` / `api.password` in
  `go2rtc.yaml`), and do not expose port 1984 to the Internet.
- If you fill in a live view address, put go2rtc behind an https reverse proxy with its own
  authentication.
- Keep Gladys, go2rtc and the integration up to date.
