import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Role } from '@prisma/client';
import { assertCanDeleteUser, UserDeletionError } from './userDeletionPolicy.js';

function actor(id: string, role: Role) {
  return { id, role };
}

function expectDenied(fn: () => void, status: number, message: string) {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof UserDeletionError);
    assert.equal(error.statusCode, status);
    assert.equal(error.message, message);
    return true;
  });
}

describe('assertCanDeleteUser', () => {
  it('allows a user to delete their own account', () => {
    assert.doesNotThrow(() =>
      assertCanDeleteUser({
        actor: actor('u1', Role.USER),
        target: actor('u1', Role.USER),
        superAdminCount: 2
      })
    );
  });

  it('allows an admin to delete a regular user', () => {
    assert.doesNotThrow(() =>
      assertCanDeleteUser({
        actor: actor('admin', Role.ADMIN),
        target: actor('u1', Role.USER),
        superAdminCount: 1
      })
    );
  });

  it('allows a super admin to delete another super admin when more than one remains', () => {
    assert.doesNotThrow(() =>
      assertCanDeleteUser({
        actor: actor('sa1', Role.SUPER_ADMIN),
        target: actor('sa2', Role.SUPER_ADMIN),
        superAdminCount: 2
      })
    );
  });

  it('forbids a non-admin from deleting someone else', () => {
    expectDenied(
      () =>
        assertCanDeleteUser({
          actor: actor('u1', Role.USER),
          target: actor('u2', Role.USER),
          superAdminCount: 1
        }),
      403,
      'Insufficient role'
    );
  });

  it('forbids an admin from deleting a super admin', () => {
    expectDenied(
      () =>
        assertCanDeleteUser({
          actor: actor('admin', Role.ADMIN),
          target: actor('sa1', Role.SUPER_ADMIN),
          superAdminCount: 2
        }),
      403,
      'Only a super admin can delete a super admin'
    );
  });

  it('forbids deleting the last super admin', () => {
    expectDenied(
      () =>
        assertCanDeleteUser({
          actor: actor('sa1', Role.SUPER_ADMIN),
          target: actor('sa1', Role.SUPER_ADMIN),
          superAdminCount: 1
        }),
      409,
      'Cannot delete the last super admin'
    );
  });
});
