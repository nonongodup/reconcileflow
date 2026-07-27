import assert from "node:assert/strict";
import test from "node:test";
import { PLAN_ENTITLEMENTS, hasAdvancedRules } from "../app/api/plans.ts";
import { migrations } from "../db/migrations.ts";

test("advertised plan limits are enforced by canonical entitlements",()=>{
  assert.deepEqual(PLAN_ENTITLEMENTS.free,{runsPerMonth:3,rowsPerFile:2000,formats:["csv"],savedTemplates:false,advancedRules:false,seats:1});
  assert.equal(PLAN_ENTITLEMENTS.professional.runsPerMonth,30); assert.equal(PLAN_ENTITLEMENTS.professional.rowsPerFile,100000);
  assert.equal(PLAN_ENTITLEMENTS.team.runsPerMonth,100); assert.equal(PLAN_ENTITLEMENTS.team.rowsPerFile,250000); assert.equal(PLAN_ENTITLEMENTS.team.seats,10);
});
test("free plan detects advanced comparison rules",()=>{assert.equal(hasAdvancedRules({}),false);assert.equal(hasAdvancedRules({numericTolerance:1}),true);});
test("billing migration contains subscriptions usage workspaces and invitations",()=>{const sql=migrations.find(m=>m.version===5)?.statements.join("\n")||"";for(const table of ["rf_subscriptions","rf_plan_usage","rf_workspaces","rf_workspace_members","rf_workspace_invitations"]) assert.match(sql,new RegExp(table));});
test("annual prices represent a 15 percent discount",()=>{assert.equal(29*12*.85,295.8);assert.equal(99*12*.85,1009.8);});
