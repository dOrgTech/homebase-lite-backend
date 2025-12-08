/**
 * Unit tests for the vote lock mechanism that prevents race conditions
 * on concurrent vote submissions.
 */

// Recreate the lock mechanism for isolated testing
const voteLocks = new Map();

async function withVoteLock(pollID, address, fn) {
  const key = `${pollID}:${address}`;

  while (voteLocks.has(key)) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  voteLocks.set(key, true);
  try {
    return await fn();
  } finally {
    voteLocks.delete(key);
  }
}

describe('withVoteLock', () => {
  beforeEach(() => {
    voteLocks.clear();
  });

  it('should execute function and return result', async () => {
    const result = await withVoteLock('poll1', 'addr1', async () => {
      return 'success';
    });
    expect(result).toBe('success');
  });

  it('should release lock after function completes', async () => {
    await withVoteLock('poll1', 'addr1', async () => {});
    expect(voteLocks.has('poll1:addr1')).toBe(false);
  });

  it('should release lock even if function throws', async () => {
    await expect(
      withVoteLock('poll1', 'addr1', async () => {
        throw new Error('test error');
      })
    ).rejects.toThrow('test error');

    expect(voteLocks.has('poll1:addr1')).toBe(false);
  });

  it('should serialize concurrent calls for same poll+address', async () => {
    const executionOrder = [];

    // Simulate the race condition scenario:
    // Two requests arrive simultaneously for the same voter
    const request1 = withVoteLock('poll1', 'addr1', async () => {
      executionOrder.push('request1:start');
      // Simulate DB check + write taking some time
      await new Promise(r => setTimeout(r, 50));
      executionOrder.push('request1:end');
      return 'vote1';
    });

    const request2 = withVoteLock('poll1', 'addr1', async () => {
      executionOrder.push('request2:start');
      await new Promise(r => setTimeout(r, 50));
      executionOrder.push('request2:end');
      return 'vote2';
    });

    // Both started at "same time"
    const [result1, result2] = await Promise.all([request1, request2]);

    // Without lock: request1:start, request2:start, request1:end, request2:end (interleaved)
    // With lock: request1:start, request1:end, request2:start, request2:end (serialized)
    expect(executionOrder).toEqual([
      'request1:start',
      'request1:end',
      'request2:start',
      'request2:end'
    ]);

    expect(result1).toBe('vote1');
    expect(result2).toBe('vote2');
  });

  it('should allow concurrent calls for DIFFERENT poll+address combinations', async () => {
    const executionOrder = [];

    // Different voters should be able to vote concurrently
    const voter1 = withVoteLock('poll1', 'addr1', async () => {
      executionOrder.push('voter1:start');
      await new Promise(r => setTimeout(r, 50));
      executionOrder.push('voter1:end');
    });

    const voter2 = withVoteLock('poll1', 'addr2', async () => {
      executionOrder.push('voter2:start');
      await new Promise(r => setTimeout(r, 50));
      executionOrder.push('voter2:end');
    });

    await Promise.all([voter1, voter2]);

    // Both should start before either ends (parallel execution)
    expect(executionOrder.indexOf('voter1:start')).toBeLessThan(executionOrder.indexOf('voter1:end'));
    expect(executionOrder.indexOf('voter2:start')).toBeLessThan(executionOrder.indexOf('voter2:end'));
    // And they should interleave (both start before both end)
    const starts = executionOrder.filter(e => e.includes(':start'));
    const ends = executionOrder.filter(e => e.includes(':end'));
    expect(starts.length).toBe(2);
    expect(ends.length).toBe(2);
    // First two should be starts, last two should be ends
    expect(executionOrder.slice(0, 2).every(e => e.includes(':start'))).toBe(true);
    expect(executionOrder.slice(2, 4).every(e => e.includes(':end'))).toBe(true);
  });

  it('should prevent the exact attack scenario (double vote)', async () => {
    // Simulate the attack: attacker sends YES and NO votes simultaneously
    let voteDatabase = { yes: 0, no: 0 };
    let hasVoted = false;

    const attackerBalance = 10;

    const voteYes = withVoteLock('poll1', 'attacker', async () => {
      // Check if already voted (the vulnerable read)
      if (hasVoted) {
        // Would update existing vote instead
        return 'already voted - would update';
      }
      // Simulate async DB operations
      await new Promise(r => setTimeout(r, 20));
      // Record vote
      hasVoted = true;
      voteDatabase.yes += attackerBalance;
      return 'voted yes';
    });

    const voteNo = withVoteLock('poll1', 'attacker', async () => {
      // Check if already voted (the vulnerable read)
      if (hasVoted) {
        return 'already voted - would update';
      }
      await new Promise(r => setTimeout(r, 20));
      hasVoted = true;
      voteDatabase.no += attackerBalance;
      return 'voted no';
    });

    const [result1, result2] = await Promise.all([voteYes, voteNo]);

    // With the lock, only ONE vote should have succeeded
    // The other should see hasVoted = true
    const totalVotes = voteDatabase.yes + voteDatabase.no;
    expect(totalVotes).toBe(attackerBalance); // NOT 2x attackerBalance!

    // One succeeded, one was blocked
    const results = [result1, result2];
    expect(results.filter(r => r.startsWith('voted')).length).toBe(1);
    expect(results.filter(r => r.startsWith('already')).length).toBe(1);
  });
});
