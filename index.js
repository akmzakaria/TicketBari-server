const express = require('express')
const cors = require('cors')
const app = express()
require('dotenv').config()
const port = process.env.PORT || 3000

// firebase service account
const admin = require('firebase-admin')

// const serviceAccount = require('./simple-firebase-akm-2-firebase-adminsdk.json')

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8')
const serviceAccount = JSON.parse(decoded)

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const stripe = require('stripe')(process.env.STRIPE_SECRET)

// middleware
app.use(express.json())
app.use(cors())

const verifyFirebaseToken = async (req, res, next) => {
  const token = req.headers.authorization
  // console.log(token)

  if (!token) {
    return res.status(401).send({ message: 'Unauthorized access' })
  }

  try {
    const tokenId = token.split(' ')[1]
    const decoded = await admin.auth().verifyIdToken(tokenId)
    // console.log('decoded in the token', decoded)

    req.decoded_email = decoded.email

    next()
  } catch (err) {
    return res.status(401).send({ message: 'Unauthorized access!' })
  }
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@first-cloud.j7wkmls.mongodb.net/?appName=first-cloud`

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect()

    const database = client.db('ticketghor')
    const ticketsColl = database.collection('tickets')
    const bookedTicketsColl = database.collection('booked_tickets')
    const usersColl = database.collection('users')
    const paymentColl = database.collection('payments')

    // verify admin & vendor
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded_email
      const query = { userEmail: email }
      const user = await usersColl.findOne(query)

      // console.log(user.role)

      if (!user || user.role !== 'admin') {
        return res.status(403).send({ message: 'Forbidden Access' })
      }

      next()
    }

    const verifyVendor = async (req, res, next) => {
      const email = req.decoded_email
      const query = { userEmail: email }
      const user = await usersColl.findOne(query)

      if (!user || user.role !== 'vendor') {
        return res.status(403).send({ message: 'Forbidden Access' })
      }

      next()
    }

    const verifyAdminOrVendor = async (req, res, next) => {
      const email = req.decoded_email
      const query = { userEmail: email }
      const user = await usersColl.findOne(query)

      if (!user || (user.role !== 'admin' && user.role !== 'vendor')) {
        return res.status(403).send({ message: 'Forbidden Access: Admins or Vendors only' })
      }

      next()
    }

    // ticket APIs
    // post by vendor [later]
    app.post('/tickets', verifyFirebaseToken, verifyVendor, async (req, res) => {
      const ticket = req.body
      const result = ticketsColl.insertOne({
        ...ticket,
        ticketStatus: 'pending',
        advertiseStatus: 'N/A',
        createdAt: new Date(),
      })
      res.send(result)
    })

    // get all tickets
    app.get('/tickets', async (req, res) => {
      const { ticketStatus } = req.query
      const { advertiseStatus } = req.query
      const { vendor_email } = req.query
      const { limit } = req.query
      // const { role } = req.query
      const query = {}

      if (ticketStatus) {
        query.ticketStatus = ticketStatus
      }
      if (advertiseStatus) {
        query.advertiseStatus = advertiseStatus
      }
      if (vendor_email) {
        query.vendor_email = vendor_email
      }
      // if (role) {
      //   query.role = { $ne: 'fraud' }
      // }

      let cursor = ticketsColl.find(query).sort({ createdAt: -1 })

      if (limit) {
        cursor.limit(Number(limit))
      }

      const result = await cursor.toArray()

      // const result = await ticketsColl.find(query).sort({ createdAt: -1 }).limit(6).toArray()
      res.send(result)
    })

    // get individual ticket info for booking
    app.get('/tickets/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await ticketsColl.findOne(query)
      res.send(result)
    })

    // make tickets approved / rejected by admin

    app.patch('/tickets/:id', verifyFirebaseToken, verifyAdminOrVendor, async (req, res) => {
      const id = req.params.id
      const { ticketStatus, advertiseStatus } = req.body
      const data = req.body

      // console.log(req.body)
      let updateDoc = {}

      if (ticketStatus) updateDoc.ticketStatus = ticketStatus
      if (advertiseStatus) updateDoc.advertiseStatus = advertiseStatus
      if (data) updateDoc = { ...data }

      // console.log(updateDoc)

      const result = await ticketsColl.updateOne({ _id: new ObjectId(id) }, { $set: updateDoc })

      res.send(result)
    })

    // delete added ticket by vendor only
    app.delete('/tickets/:id', verifyFirebaseToken, verifyVendor, async (req, res) => {
      const { id } = req.params
      const query = { _id: new ObjectId(id) }

      const result = await ticketsColl.deleteOne(query)
      res.send(result)
    })

    // get the stats of the tickets using pipeline
    // app.get('/tickets/ticket-status/stats', async (req, res) => {
    //   const pipeline = [
    //     {
    //       $group: {
    //         _id: '$ticketStatus',
    //         count: { $sum: 1 },
    //       },
    //     },
    //   ]

    //   const result = await ticketsColl.aggregate(pipeline).toArray()
    //   res.send(result)
    // })

    // get approved tickets for each vendors
    app.get('/vendors/ticket-status', verifyFirebaseToken, verifyVendor, async (req, res) => {
      const email = req.query.email

      const pipeline = [
        {
          $match: {
            vendor_email: email,
            ticketStatus: 'approved',
          },
        },
        {
          $group: {
            _id: null,
            totalAddedTickets: { $sum: { $toInt: '$quantity' } },
          },
        },
      ]

      const pipelineSold = [
        {
          $match: {
            vendorEmail: email,
            bookingStatus: 'paid',
          },
        },
        {
          $group: {
            _id: null,
            totalBookingQty: { $sum: '$bookingQty' },
          },
        },
      ]

      const pipelineRevenue = [
        {
          $match: {
            vendorEmail: email,
            bookingStatus: 'paid',
          },
        },
        {
          $project: {
            revenue: { $multiply: [{ $toInt: '$bookingQty' }, { $toInt: '$price' }] },
          },
        },
        {
          $group: {
            _id: null,
            actualRevenue: { $sum: '$revenue' },
          },
        },
      ]

      const pipelineTotalRevenue = [
        {
          $match: {
            vendor_email: email,
            ticketStatus: 'approved',
          },
        },
        {
          $project: {
            revenue: { $multiply: [{ $toInt: '$quantity' }, { $toInt: '$price' }] },
          },
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$revenue' },
          },
        },
      ]

      const soldResult = await bookedTicketsColl.aggregate(pipelineSold).toArray()
      const approvedResult = await ticketsColl.aggregate(pipeline).toArray()
      const revenueResult = await bookedTicketsColl.aggregate(pipelineRevenue).toArray()
      const totalRevenueResult = await ticketsColl.aggregate(pipelineTotalRevenue).toArray()
      // console.log(soldResult)
      res.send({
        approvedTickets: approvedResult[0]?.totalAddedTickets || 0,
        soldTickets: soldResult[0]?.totalBookingQty || 0,
        actualRevenue: revenueResult[0]?.actualRevenue || 0,
        totalRevenue: totalRevenueResult[0]?.totalRevenue || 0,
      })
    })

    // post booked tickets
    app.post('/booked-tickets', verifyFirebaseToken, async (req, res) => {
      const {
        title,
        image,
        bookingQty,
        quantity,
        price,
        totalPrice,
        from,
        to,
        departure,
        bookingStatus,
        userEmail,
        vendorEmail,
      } = req.body

      const result = bookedTicketsColl.insertOne({
        title,
        image,
        bookingQty,
        quantity,
        price,
        totalPrice,
        from,
        to,
        departure,
        bookingStatus,
        bookedAt: new Date(),
        userEmail,
        vendorEmail,
        // should post the user email to separate them by emails
      })
      res.send(result)
    })

    // get by email later
    // get booked tickets
    app.get('/booked-tickets', verifyFirebaseToken, async (req, res) => {
      const { userEmail, bookingStatus } = req.query

      const query = {}

      // if (bookingStatus) {
      //   query.bookingStatus = bookingStatus
      // }

      if (bookingStatus) {
        const statuses = bookingStatus.split(',')
        query.bookingStatus = { $in: statuses }
      }

      if (userEmail) {
        query.userEmail = userEmail
      }

      const result = await bookedTicketsColl.find(query).sort({ bookedAt: -1 }).toArray()
      res.send(result)
    })

    // get individual booked ticket info for payment
    app.get('/booked-tickets/:id', verifyFirebaseToken, async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await ticketsColl.findOne(query)
      res.send(result)
    })

    // update booking status by the vendor
    app.patch('/booked-tickets/:id', verifyFirebaseToken, verifyVendor, async (req, res) => {
      const id = req.params.id
      const { bookingStatus } = req.body
      const result = await bookedTicketsColl.updateOne(
        { _id: new ObjectId(id) },
        { $set: { bookingStatus } }
      )
      res.send(result)
    })

    // get all the users
    app.get('/users', async (req, res) => {
      const { role } = req.query

      const query = {}

      if (role) {
        query.role = role
      }

      const result = await usersColl.find(query).toArray()
      res.send(result)
    })

    // send the userInfo to the database
    app.post('/users', async (req, res) => {
      const { userName, userEmail, photoURL, role } = req.body

      const userExists = await usersColl.findOne({ userEmail })
      if (userExists) {
        return res.send({ message: 'user exists' })
      }

      const result = await usersColl.insertOne({
        userName,
        userEmail,
        photoURL,
        role,
      })
      res.send(result)
    })

    // change the user role when admin updates it
    app.patch('/users/:id', verifyFirebaseToken, verifyAdmin, async (req, res) => {
      const id = req.params.id
      const { role } = req.body

      const result = await usersColl.updateOne({ _id: new ObjectId(id) }, { $set: { role } })
      res.send(result)
    })

    // payment APIs
    app.post('/create-checkout-session', async (req, res) => {
      const paymentInfo = req.body
      const amount = Number(paymentInfo.totalPrice) * 100

      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            // Provide the exact Price ID (for example, price_1234) of the product you want to sell
            price_data: {
              currency: 'BDT',
              unit_amount: amount,
              product_data: {
                name: `Please pay for ${paymentInfo.title}`,
              },
            },
            quantity: 1,
          },
        ],
        customer_email: paymentInfo.userEmail,
        mode: 'payment',
        metadata: {
          ticketId: paymentInfo.ticketId,
          title: paymentInfo.title,
        },
        success_url: `${process.env.SITE_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/payment-cancelled`,
      })
      // console.log(session)
      res.send({ url: session.url })
    })

    // Update the payment info after payment
    // app.patch('/payment-success', async (req, res) => {
    //   const sessionId = req.query.session_id

    //   const session = await stripe.checkout.sessions.retrieve(sessionId)

    //   const transactionId = session.payment_intent
    //   const query = { transactionId: transactionId }

    //   const paymentExist = await paymentColl.findOne(query)
    //   console.log(paymentExist)

    //   if (paymentExist) {
    //     return res.send({
    //       message: 'already exist',
    //       transactionId,
    //     })
    //   }

    //   if (session.payment_status === 'paid') {
    //     const id = session.metadata.ticketId
    //     const query = { _id: new ObjectId(id) }
    //     const update = {
    //       $set: {
    //         bookingStatus: 'paid',
    //       },
    //     }
    //     const result = await bookedTicketsColl.updateOne(query, update)

    //     const payment = {
    //       amount: session.amount_total / 100,
    //       currency: session.currency,
    //       customer_email: session.customer_email,
    //       ticketId: session.metadata.ticketId,
    //       title: session.metadata.title,
    //       transactionId: session.payment_intent,
    //       paymentStatus: session.payment_status,
    //       paidAt: new Date(),
    //     }

    //     const resultPayment = await paymentColl.insertOne(payment)

    //     return res.send({
    //       success: true,
    //       modifyTicket: result,
    //       paymentInfo: resultPayment,
    //       transactionId: session.payment_intent,
    //     })
    //   }

    //   return res.send({ success: false })
    // })

    app.patch('/payment-success', async (req, res) => {
      try {
        const sessionId = req.query.session_id
        if (!sessionId) return res.status(400).send({ message: 'No session ID' })

        const session = await stripe.checkout.sessions.retrieve(sessionId)
        const transactionId = session.payment_intent

        const paymentExist = await paymentColl.findOne({ transactionId })
        if (paymentExist) {
          return res.send({ message: 'already exist', transactionId })
        }

        if (session.payment_status === 'paid') {
          const ticketId = session.metadata.ticketId

          const payment = {
            amount: session.amount_total / 100,
            currency: session.currency,
            customer_email: session.customer_email,
            ticketId: ticketId,
            title: session.metadata.title,
            transactionId: transactionId,
            paymentStatus: session.payment_status,
            paidAt: new Date(),
          }

          try {
            const resultPayment = await paymentColl.insertOne(payment)

            const result = await bookedTicketsColl.updateOne(
              { _id: new ObjectId(ticketId) },
              { $set: { bookingStatus: 'paid' } }
            )

            return res.send({
              success: true,
              modifyTicket: result,
              paymentInfo: resultPayment,
              transactionId,
            })
          } catch (err) {
            if (err.code === 11000) {
              // This catches the race condition if two requests hit at once
              return res.send({ message: 'already exist', transactionId })
            }
            throw err // Rethrow other DB errors
          }
        }
        res.send({ success: false })
      } catch (error) {
        console.error('Payment Success Error:', error)
        res.status(500).send({ error: 'Internal Server Error' })
      }
    })

    app.get('/payments', verifyFirebaseToken, async (req, res) => {
      const email = req.query.email
      const query = {}

      // console.log('headers', req.headers)

      if (email) {
        query.customer_email = email

        // check email address
        // if (email !== req.decoded_email) {
        //   return res.status(403).send({ message: 'Forbidden access!' })
        // }
      }
      const cursor = paymentColl.find(query).sort({ paidAt: -1 })
      const result = await cursor.toArray()
      res.send(result)
    })

    // Send a ping to confirm a successful connection
    // await client.db('admin').command({ ping: 1 })
    // console.log('Pinged your deployment. You successfully connected to MongoDB!')
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close()
  }
}
run().catch(console.dir)

app.get('/', (req, res) => {
  res.send('Server running!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
