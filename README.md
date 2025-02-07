# Apple Bulk Price Editor

by Josh Mohrer [@joshmohrer](https://twitter.com/joshmohrer)

## Instructions

### Step 1: Update API Configuration

In `/api/appstore/prices/route.ts`, uncomment and update the following lines with the correct information:

```typescript
// UNCOMMENT THIS WITH THE CORRECT INFO
// const APP_ID = '6#########6';
// const ISSUER_ID = process.env.APPSTORE_ISSUER_ID;
// const KEY_ID = 'Z#######HP';
// const PRIVATE_KEY_PATH = path.join(process.cwd(), 'app/AuthKey_Z######P.p8');
```

### Step 2: Set Up Environment Variables

Create a `.env` file in your project root and add your App Store issuer ID:

```env
APPSTORE_ISSUER_ID=xxxxxxx-xxxxx-xxxxx-xxxxx-xxxxxxxxxxx
```

## Notes

This is my first open-source project, so please be gentle. I’d appreciate PRs with improvements!

Use at your own risk, but do with it what you want. Just do me a favor—use [Wave AI Note Taker](https://wave.co).


