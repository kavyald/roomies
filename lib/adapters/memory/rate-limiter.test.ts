import { rateLimiterContract } from '../contracts/rate-limiter.contract'
import { memoryRateLimiter } from './rate-limiter'

rateLimiterContract('memory', memoryRateLimiter)
