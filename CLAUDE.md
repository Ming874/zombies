## Zeabur Deployment
- Project: temp (ID: 6adda651c375e0e40c02b23f), on Ming's Server
- GitHub repo: Ming874/zombies (renamed from Ming874/ta; Zeabur repo ID 1432875614)
- Service `zombie` (ID: 6adda657c375e0e40c02b240) — tracks branch `main`; pushing to `main` triggers a redeploy
- Service `zombie-test` (ID: 6ade3940c375e0e40c02d353) — tracks branch `test`; pushing to `test` triggers a redeploy
- A force-push does not trigger an automatic redeploy; run `npx zeabur@latest service redeploy --id <service-id> -y -i=false`
