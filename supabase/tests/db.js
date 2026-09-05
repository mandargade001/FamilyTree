import pg from 'pg'

const { Pool } = pg
export const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? 'postgresql:///vansh_dev' })

function toError(err) {
  return { message: err.message }
}

export const supabase = {
  async rpc(fnName, args = {}) {
    const keys = Object.keys(args)
    const values = keys.map((k) => args[k])
    const namedArgs = keys.map((k, i) => `${k} := $${i + 1}`).join(', ')
    try {
      const res = await pool.query(`select ${fnName}(${namedArgs}) as result`, values)
      return { data: res.rows[0]?.result ?? null, error: null }
    } catch (err) {
      return { data: null, error: toError(err) }
    }
  },
  from(table) {
    return {
      select(cols = '*') {
        const state = { filters: [], limitN: null }
        async function run() {
          let sql = `select ${cols} from ${table}`
          const values = []
          state.filters.forEach((f, i) => {
            sql += i === 0 ? ' where' : ' and'
            values.push(f.val)
            sql += ` ${f.col} = $${values.length}`
          })
          if (state.limitN) sql += ` limit ${state.limitN}`
          try {
            const res = await pool.query(sql, values)
            return { data: res.rows, error: null }
          } catch (err) {
            return { data: null, error: toError(err) }
          }
        }
        const builder = {
          eq(col, val) {
            state.filters.push({ col, val })
            return builder
          },
          limit(n) {
            state.limitN = n
            return builder
          },
          async single() {
            const r = await run()
            if (r.error) return r
            return r.data[0] ? { data: r.data[0], error: null } : { data: null, error: { message: 'no rows' } }
          },
          then(resolve, reject) {
            return run().then(resolve, reject)
          },
        }
        return builder
      },
      async insert(row) {
        const keys = Object.keys(row)
        const values = keys.map((k) => row[k])
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ')
        try {
          await pool.query(`insert into ${table} (${keys.join(', ')}) values (${placeholders})`, values)
          return { error: null }
        } catch (err) {
          return { error: toError(err) }
        }
      },
    }
  },
}
