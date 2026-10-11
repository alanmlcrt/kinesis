import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

// Version du code écrite dans le manifeste des exports ; « modifié » si l'arbre de travail diffère du commit.
const git = (command) => { try { return execSync(command, { encoding: 'utf8' }).trim() } catch { return '' } }
const commit = (git('git rev-parse --short HEAD') || 'inconnu') + (git('git status --porcelain') ? ' (modifié)' : '')

export default defineConfig({ plugins: [react()], define: { __COMMIT__: JSON.stringify(commit) } })
