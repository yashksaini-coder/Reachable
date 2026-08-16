"""Phase 0 proof: a real write, committed and read back over Bolt.

A listening port is not proof the node works. This is.
"""

from hydra import DATABASE, URI, driver


def main():
    with driver() as d:
        d.verify_connectivity()
        print(f"connected  {URI}  database={DATABASE}")

        with d.session(database=DATABASE) as s:
            # Plain `MERGE ... SET` is rejected ("MERGE with following clauses is
            # not executable"). The UNWIND batch form is the only property upsert.
            s.run(
                "UNWIND $rows AS row MERGE (n {id: row.id}) SET n:Package, n.name = row.name",
                rows=[{"id": 1, "name": "left-pad"}, {"id": 2, "name": "lodash"}],
            ).consume()
            s.run("MERGE (a {id: 1})-[:DEPENDS_ON]->(b {id: 2})").consume()

            row = s.run(
                "MATCH (a {id: 1})-[:DEPENDS_ON]->(b) RETURN b.id AS id, b.name AS name"
            ).single(strict=True)

    assert row["id"] == 2 and row["name"] == "lodash", row
    print(f"round-trip ok  ->  id={row['id']} name={row['name']}")


if __name__ == "__main__":
    main()
