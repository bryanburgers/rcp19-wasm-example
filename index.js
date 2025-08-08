const evaluate = require("./evaluate");
const { Evaluator } = require("./evaluator");

async function main() {
  console.log("With evaluate function:");
  // Evaluate an RCP19 expression!
  const expression = `ListPrice < LAST ListPrice .OR. (ClosePrice != .EMPTY. .AND. LAST ClosePrice = .EMPTY. .AND. ClosePrice < ListPrice)`;
  const resourceData = { ListPrice: 490_000 };
  const previousResourceData = { ListPrice: 500_000 };
  const isPriceDrop = await evaluate(
    expression,
    resourceData,
    previousResourceData
  );
  if (isPriceDrop) {
    console.log("  Price drop!");
  } else {
    console.log("  No price drop.");
  }

  // Evaluate another RCP19 expression!
  const bathroomsTotalIntegerExpression = `IIF(BathroomsFull = .EMPTY., 0, BathroomsFull) + IIF(BathroomsPartial = .EMPTY., IIF(BathroomsHalf = .EMPTY., 0, BathroomsHalf), BathroomsPartial)`;
  const bathroomsTotalIntegerOne = await evaluate(
    bathroomsTotalIntegerExpression,
    {
      BathroomsFull: 2,
    }
  );
  console.log(`  Total bathrooms: ${bathroomsTotalIntegerOne}`);

  // Evaluate the same expression with different data!
  const bathroomsTotalIntegerTwo = await evaluate(
    bathroomsTotalIntegerExpression,
    {
      BathroomsFull: 2,
      BathroomsPartial: 1,
    }
  );
  console.log(`  Total bathrooms: ${bathroomsTotalIntegerTwo}`);

  // Evaluate another one!
  const now = await evaluate(`.NOW.`);
  console.log(`  Now: ${now}`);

  // The "Evaluator" interface create the WebAssembly instance once and holds
  // on to it, so we don't have to reinstantiate it every time, and so we don't
  // need to use `async` everywhere once the evaluator is created.
  //
  // But it's not nearly as well documented, so understand evaluate.js before
  // looking at evaluator.js
  const evaluator = await Evaluator.create();
  console.log();
  console.log("With Evaluator instance:");

  const isPriceDrop2 = evaluator.evaluate(
    expression,
    resourceData,
    previousResourceData
  );
  if (isPriceDrop2) {
    console.log("  Price drop!");
  } else {
    console.log("  No price drop.");
  }

  const bathroomsTotalIntegerThree = evaluator.evaluate(
    bathroomsTotalIntegerExpression,
    {
      BathroomsFull: 2,
    }
  );
  console.log(`  Total bathrooms: ${bathroomsTotalIntegerThree}`);

  // Evaluate the same expression with different data!
  const bathroomsTotalIntegerFour = evaluator.evaluate(
    bathroomsTotalIntegerExpression,
    {
      BathroomsFull: 2,
      BathroomsPartial: 1,
    }
  );
  console.log(`  Total bathrooms: ${bathroomsTotalIntegerFour}`);

  // Evaluate another one!
  const nowTwo = evaluator.evaluate(`.NOW.`);
  console.log(`  Now: ${nowTwo}`);
}

main().catch((err) => console.log(err));
