---
paths: ["**/*"]
---


## RULE 1: THE GENERATED CODE BAN
You are forbidden from assuming the structure of generated code (MapStruct, Lombok, OpenAPI, etc.). 
Before writing code modifications, you MUST execute a `read_file` or terminal `grep` on the `build/generated` or `target/generated-sources` directories. If you do not explicitly output the contents of the generated implementation class in your logs, the user will terminate the session.

## RULE 2: ARCHITECTURE PARITY CHECK
If a `Dockerfile` exists in the repository, you are banned from treating a local build as production-equivalent. 
Before declaring a task complete, you must read the multi-stage copy commands inside the Dockerfile and explain how it bundles assets (e.g., Angular/React apps into Java JARs). 

## RULE 3: CRITIQUE BEFORE ACTION
Before invoking any file-writing tool (`write_to_file`, `apply_diff`), you must output a `<self_critique>` block:
<self_critique>
- 1 Transitive dependency or generated class this change could break: [Specify]
- Local vs. Docker environment differences that apply to this file: [Specify]
</self_critique>